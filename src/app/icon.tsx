import { ImageResponse } from "next/og";

// Favicon de ARK-IA: circulo negro con el monograma "IA" en verde de marca.
//
// Antes esto dibujaba un cuadrado violeta con un globo de chat. Next.js
// inyecta esta ruta como <link rel="icon"> automaticamente y le gana a
// cualquier PNG declarado en metadata, asi que cambiar solo el metadata no
// alcanzaba: habia que cambiar el generador.
//
// Se dibuja en vez de servir el PNG porque a 32px un logotipo horizontal es
// una mancha; el monograma se lee. La forma de las letras replica la del
// logotipo: cursiva, condensada, con la barra de la A alta.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0A0E13",
          borderRadius: "50%",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 19,
            fontWeight: 800,
            fontStyle: "italic",
            letterSpacing: -1,
            color: "#00FFA2",
            lineHeight: 1,
          }}
        >
          IA
        </div>
      </div>
    ),
    { ...size },
  );
}
