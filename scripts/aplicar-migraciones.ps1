# ============================================
# Script para Aplicar Migraciones Enterprise
# ARCA CRM - Twenty Features
# ============================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  ARCA ENTERPRISE - APLICAR MIGRACIONES" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Verificar si hay credenciales de Supabase
$envFile = ".env.local"
$envExample = ".env.local.example"

if (!(Test-Path $envFile)) {
    Write-Host "[INFO] No se encontró .env.local" -ForegroundColor Yellow
    if (Test-Path $envExample) {
        Write-Host "[INFO] Copiando $envExample a $envFile" -ForegroundColor Yellow
        Copy-Item $envExample $envFile
        Write-Host "[OK] .env.local creado. Edítalo con tus credenciales de Supabase." -ForegroundColor Green
    }
} else {
    Write-Host "[OK] .env.local encontrado" -ForegroundColor Green
}

# Leer URL de Supabase si existe
$supabaseUrl = ""
if (Test-Path $envFile) {
    $supabaseUrl = Get-Content $envFile | Where-Object { $_ -match "NEXT_PUBLIC_SUPABASE_URL" } | ForEach-Object { $_.Split('=')[1] }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  INSTRUCCIONES PARA APLICAR MIGRACIONES" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "OPCIÓN 1: Dashboard de Supabase (RECOMENDADO)" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray
Write-Host "`n1. Abre tu navegador en:" -ForegroundColor White
Write-Host "   https://supabase.com/dashboard" -ForegroundColor Cyan
Write-Host "`n2. Inicia sesión y selecciona tu proyecto 'wacrm'" -ForegroundColor White
Write-Host "`n3. Ve a 'SQL Editor' en el menú lateral" -ForegroundColor White
Write-Host "`n4. Ejecuta la migración 070:" -ForegroundColor White
Write-Host "   - Abre: supabase\migrations\070_custom_objects.sql" -ForegroundColor Gray
Write-Host "   - Copia TODO el contenido" -ForegroundColor Gray
Write-Host "   - Pega en el SQL Editor" -ForegroundColor Gray
Write-Host "   - Haz clic en 'Run'" -ForegroundColor Gray

Write-Host "`n5. Ejecuta la migración 071:" -ForegroundColor White
Write-Host "   - Abre: supabase\migrations\071_enterprise_features.sql" -ForegroundColor Gray
Write-Host "   - Copia TODO el contenido" -ForegroundColor Gray
Write-Host "   - Pega en el SQL Editor" -ForegroundColor Gray
Write-Host "   - Haz clic en 'Run'" -ForegroundColor Gray

Write-Host "`n`nOPCIÓN 2: CLI de Supabase (Requiere Login)" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray
Write-Host "`n1. Inicia sesión en Supabase:" -ForegroundColor White
Write-Host "   npx supabase login" -ForegroundColor Cyan
Write-Host "`n2. Linkea tu proyecto (necesitas el project ref):" -ForegroundColor White
Write-Host "   npx supabase link --project-ref <tu-project-ref>" -ForegroundColor Cyan
Write-Host "   (El project ref está en Dashboard → Settings → General)" -ForegroundColor Gray
Write-Host "`n3. Aplica las migraciones:" -ForegroundColor White
Write-Host "   npx supabase db push" -ForegroundColor Cyan

Write-Host "`n`nOPCIÓN 3: Supabase Local (Requiere Docker)" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray
Write-Host "`n1. Inicia Supabase local:" -ForegroundColor White
Write-Host "   npx supabase start" -ForegroundColor Cyan
Write-Host "`n2. Las migraciones se aplican automáticamente" -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  VERIFICACIÓN" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Después de aplicar las migraciones, verifica:" -ForegroundColor White
Write-Host "`n1. En el SQL Editor de Supabase, ejecuta:" -ForegroundColor Gray
Write-Host @"
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'custom_%'
ORDER BY table_name;
"@ -ForegroundColor Cyan

Write-Host "`n2. Deberías ver 14 tablas:" -ForegroundColor White
Write-Host "   ✓ custom_objects" -ForegroundColor Green
Write-Host "   ✓ custom_fields" -ForegroundColor Green
Write-Host "   ✓ custom_views" -ForegroundColor Green
Write-Host "   ✓ custom_object_records" -ForegroundColor Green
Write-Host "   ✓ field_audit_logs" -ForegroundColor Green
Write-Host "   ✓ object_permissions" -ForegroundColor Green
Write-Host "   ✓ object_relations" -ForegroundColor Green
Write-Host "   ✓ object_relation_records" -ForegroundColor Green
Write-Host "   ✓ custom_reports" -ForegroundColor Green
Write-Host "   ✓ ai_tool_executions" -ForegroundColor Green
Write-Host "   ✓ custom_layouts" -ForegroundColor Green
Write-Host "   ✓ activity_timeline" -ForegroundColor Green
Write-Host "   ✓ advanced_tasks" -ForegroundColor Green
Write-Host "   ✓ centralized_files" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  PRÓXIMOS PASOS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "1. Aplica las migraciones (elige una opción arriba)" -ForegroundColor White
Write-Host "2. Verifica que se crearon las 14 tablas" -ForegroundColor White
Write-Host "3. Reinicia tu servidor de desarrollo:" -ForegroundColor White
Write-Host "   npm run dev" -ForegroundColor Cyan
Write-Host "4. Navega a: http://localhost:3000/dashboard/objects" -ForegroundColor Cyan
Write-Host "5. ¡Crea tu primer objeto personalizado!" -ForegroundColor White

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  DOCUMENTACIÓN ADICIONAL" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Para más detalles, revisa:" -ForegroundColor White
Write-Host "  📄 docs/APLICAR_MIGRACIONES.md - Instrucciones detalladas" -ForegroundColor Cyan
Write-Host "  📄 docs/PROXIMOS_PASOS.md - Próximos pasos" -ForegroundColor Cyan
Write-Host "  📄 docs/CARACTERISTICAS_ENTERPRISE.md - Guía de uso" -ForegroundColor Cyan
Write-Host "  📄 README_ENTERPRISE.md - Resumen general" -ForegroundColor Cyan

Write-Host "`n========================================`n" -ForegroundColor Cyan

# Preguntar si quiere abrir el dashboard
Write-Host "¿Quieres abrir el dashboard de Supabase ahora? (S/N)" -ForegroundColor Yellow
$response = Read-Host

if ($response -eq 'S' -or $response -eq 'Y' -or $response -eq 's' -or $response -eq 'y') {
    Start-Process "https://supabase.com/dashboard"
    Write-Host "`n[OK] Dashboard abierto en tu navegador" -ForegroundColor Green
    Write-Host "Recuerda: Ve a SQL Editor → New query" -ForegroundColor White
}

Write-Host "`n[INFO] Script completado" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Cyan
