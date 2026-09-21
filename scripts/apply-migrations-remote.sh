#!/bin/bash
# ============================================
# Script para Aplicar Migraciones ARCA Enterprise
# Servidor Remoto con Docker
# ============================================

echo "=========================================="
echo "  ARCA ENTERPRISE - APLICAR MIGRACIONES"
echo "=========================================="

# Buscar contenedor de Supabase/Postgres
echo ""
echo "Buscando contenedor de base de datos..."
DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -iE 'supabase.*db|postgres|db' | head -1)

if [ -z "$DB_CONTAINER" ]; then
    echo "ERROR: No se encontró contenedor de base de datos"
    echo "Contenedores disponibles:"
    docker ps --format '{{.Names}}'
    exit 1
fi

echo "Contenedor encontrado: $DB_CONTAINER"

# Copiar archivos de migración al servidor (si no existen)
MIGRATION_070="/tmp/070_custom_objects.sql"
MIGRATION_071="/tmp/071_enterprise_features.sql"

# Verificar si los archivos existen en el servidor
if [ ! -f "$MIGRATION_070" ]; then
    echo ""
    echo "ERROR: El archivo $MIGRATION_070 no existe en el servidor"
    echo "Primero copia los archivos al servidor:"
    echo "  scp -P 2235 supabase/migrations/070_custom_objects.sql root@201.184.75.220:/tmp/"
    echo "  scp -P 2235 supabase/migrations/071_enterprise_features.sql root@201.184.75.220:/tmp/"
    exit 1
fi

if [ ! -f "$MIGRATION_071" ]; then
    echo ""
    echo "ERROR: El archivo $MIGRATION_071 no existe en el servidor"
    echo "Primero copia los archivos al servidor:"
    echo "  scp -P 2235 supabase/migrations/071_enterprise_features.sql root@201.184.75.220:/tmp/"
    exit 1
fi

# Aplicar migración 070
echo ""
echo "Aplicando migración 070_custom_objects.sql..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f "$MIGRATION_070"

if [ $? -eq 0 ]; then
    echo "✓ Migración 070 aplicada exitosamente"
else
    echo "✗ Error al aplicar migración 070"
    exit 1
fi

# Aplicar migración 071
echo ""
echo "Aplicando migración 071_enterprise_features.sql..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -f "$MIGRATION_071"

if [ $? -eq 0 ]; then
    echo "✓ Migración 071 aplicada exitosamente"
else
    echo "✗ Error al aplicar migración 071"
    exit 1
fi

# Verificar tablas creadas
echo ""
echo "Verificando tablas creadas..."
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'custom_%'
ORDER BY table_name;"

echo ""
echo "=========================================="
echo "  MIGRACIONES APLICADAS EXITOSAMENTE"
echo "=========================================="
echo ""
echo "Próximos pasos:"
echo "1. Reinicia tu aplicación local: npm run dev"
echo "2. Navega a: http://localhost:3000/dashboard/objects"
echo "3. ¡Crea tu primer objeto personalizado!"
