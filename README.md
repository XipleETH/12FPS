# 12FPS (Consolidado a Reddit Devvit)

Se ha eliminado la versión independiente para Vercel/R2. El repositorio ahora mantiene **solo** la implementación Reddit (Devvit) ubicada en `twelve-fps/`.

## Estructura activa
```
twelve-fps/
  src/client   # WebView (React) para Reddit Interactive Post
  src/server   # Lógica Devvit + Redis interno (frames, voting, locks)
```

## Scripts (desde la raíz)
| Comando | Acción |
|---------|--------|
| `npm run dev` | Modo desarrollo (delegado a `twelve-fps`) |
| `npm run build` | Build cliente + server Devvit |
| `npm run upload` | `devvit upload` nueva versión |
| `npm run type-check` | TypeScript (delegado) |
| `npm run lint` | Lint (delegado) |

## Qué se eliminó
- Carpeta `api/` (endpoints R2 / S3)
- Carpeta `src/` raíz (front Vercel)
- Dependencias AWS en package raíz
- Scripts de sincronización duplicados

## Migración / Persistencia
- Persistencia remota y locking ahora vive únicamente en los endpoints de `twelve-fps/src/server`.
- Cualquier referencia a R2 debe eliminarse de pipelines/variables de entorno externas.

## Próximos pasos sugeridos
1. Verificar que entornos de CI/CD ya no intentan hacer deploy a Vercel.
2. Limpiar variables: `R2_*` ya no necesarias (a menos que se reutilicen para un CDN futuro).
3. Implementar (si falta) snapshot incremental de progreso en Redis para recuperación tras reload.
4. Añadir pruebas mínimas (Vitest) a lógica de sesión y votos.

## License
BSD-3-Clause (ver `twelve-fps/LICENSE`).
