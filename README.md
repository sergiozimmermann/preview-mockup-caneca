# Caneca 360° — ferramenta Three.js

Ferramenta local para gerar vídeo de prévia 360° de caneca personalizada usando Three.js, sem Blender.

## O que ela faz

- Upload de uma imagem/mockup em proporção 19.5:9, equivalente a 21 cm × 9,7 cm.
- Modelo 3D aproximado de caneca com 9,8 cm de altura e 8,2 cm de diâmetro.
- Arte aplicada preenchendo 21 cm na circunferência da caneca.
- Arte centralizada horizontalmente no lado oposto da alça.
- Margem superior padrão de 0,1 cm.
- Exportação de vídeo 360° em Full HD, 2K, 4K ou quadrado.
- Exportação de imagem PNG da prévia.

## Correção desta versão

Esta versão não depende mais do `MediaRecorder` como método principal para gerar o vídeo. O botão de render agora tenta primeiro gerar um **MP4 com duração fixa e timestamps corretos**, usando **WebCodecs + mp4-muxer**.

Isso corrige os problemas comuns do `.webm` no navegador:

- vídeo sem duração no player;
- conversão para MP4 ficando com tempo errado;
- travadas/lag no vídeo final;
- frames com timestamps irregulares.

Se o navegador não suportar WebCodecs/H.264, a ferramenta cai automaticamente para WEBM em tempo real.

## Como rodar

1. Instale o Node.js.
2. Abra a pasta no terminal.
3. Rode:

```bash
npm install
npm run start
```

4. Abra o endereço mostrado no terminal, geralmente `http://localhost:5173`.
5. Envie o mockup e clique em **Renderizar vídeo 360°**.

## Recomendação

Use o **Google Chrome ou Microsoft Edge** para exportar em MP4 direto. Firefox pode cair para WEBM porque ainda tem suporte limitado a WebCodecs.

Para teste inicial, use:

- Full HD 1920×1080
- 30 FPS
- Duração 6 segundos
- Qualidade Alta

Depois que validar, aumente para 2K ou 4K.

## Se cair para WEBM

Se o navegador não suportar MP4 direto e a ferramenta exportar WEBM, converta com timestamps corrigidos assim:

```bash
ffmpeg -fflags +genpts -i caneca-360.webm -r 30 -c:v libx264 -pix_fmt yuv420p -movflags +faststart caneca-360.mp4
```

Troque `-r 30` por `-r 60` se exportou em 60 FPS.

## Ajustes físicos padrão

- Caneca: 9,8 cm de altura e 8,2 cm de diâmetro.
- Arte: 21 cm × 9,7 cm.
- Margem superior: 0,1 cm.
- Alça em 0°, centro da arte no lado oposto.
