# Respaldos de la base de datos

Esquema propio de respaldos del Plan de Alcance §9, **sin usar los backups de Supabase** (esos
vienen con el plan pago). Todo corre sobre servicios gratuitos: GitHub Actions saca la copia y
Google Drive la guarda.

| Qué | Cómo |
|---|---|
| Frecuencia | Diario, 03:00 hora Colombia (`.github/workflows/respaldo-diario.yml`) + manual cuando se quiera |
| Qué se respalda | Estructura y datos de `public` e `interno` (todo el negocio: órdenes, pagos, caja, inventario, personal, bitácora…), cuentas de login (`auth.users`, `auth.identities`), historial de migraciones y los triggers propios sobre `auth` |
| Dónde | Google Drive, carpeta `Respaldos Lavadero SM/` → `diario/`, `semanal/`, `mensual/` |
| Retención | 7 diarios · 4 semanales (domingos) · 12 mensuales (día 1) |
| Seguridad | Cifrado AES-256 con una clave que solo tiene gerencia. Sin la clave el archivo no sirve — ni a un tercero ni a nosotros |
| Validación | Falla (y no sube) si falta una tabla clave, si una tabla clave sale vacía, si el archivo pesa menos de 50 KB o menos de la mitad del respaldo anterior, o si no se puede abrir con la clave. Después de subirlo compara el md5 de Drive con el local |
| Aviso de fallo | Abre un issue "Respaldo fallido" en GitHub (llega por correo). Se cierra solo con el siguiente respaldo exitoso |
| Prueba de restauración | Automática el día 2 de cada mes (`prueba-restauracion.yml`): restaura el último respaldo en una base Supabase desechable dentro de GitHub y compara tabla por tabla el número de filas |
| Pérdida máxima ante un incidente | 24 horas (lo registrado desde el último respaldo) |

> El repositorio es **público**: los registros de GitHub Actions los puede ver cualquiera. Por
> eso los scripts no imprimen datos del negocio (solo tamaños y "OK/falló") y las credenciales
> van como *secrets*, que GitHub oculta.

---

## 1. Configuración inicial (una sola vez)

Se necesitan tres *secrets* en GitHub (repo → Settings → Secrets and variables → Actions →
*New repository secret*), o desde la terminal con `gh secret set NOMBRE` (pide pegar el valor).

### 1.1 `SUPABASE_DB_URL` — la conexión a la base

1. En Supabase: botón **Connect** (arriba en el proyecto) → pestaña **Connection string** →
   **Session pooler**.
2. Copiar la cadena. Tiene esta forma:
   `postgresql://postgres.uuxdzgxzvthlwinnrzzh:[YOUR-PASSWORD]@aws-0-<región>.pooler.supabase.com:5432/postgres`
3. Reemplazar `[YOUR-PASSWORD]` por la contraseña de la base. Si nadie la recuerda: Project
   Settings → Database → *Reset database password* (no afecta a la app, que usa la anon key).

Tiene que ser la de **Session pooler** (puerto 5432): la "Direct connection" solo funciona por
IPv6 y los servidores de GitHub no lo tienen; la "Transaction pooler" (puerto 6543) no sirve
para `pg_dump`.

### 1.2 `RCLONE_DRIVE_TOKEN` — el permiso para escribir en Google Drive

Recomendado: una cuenta de Google **exclusiva para respaldos** (ej. `respaldos.carwashsm@gmail.com`),
porque este permiso da acceso a todo el Drive de esa cuenta.

En el PC (una sola vez):

```powershell
winget install Rclone.Rclone
rclone authorize "drive"
```

Se abre el navegador: iniciar sesión con la cuenta de respaldos y aceptar. En la terminal
aparece un bloque como `{"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}`.
Ese JSON completo (con las llaves) es el valor del secret.

### 1.3 `RESPALDO_CLAVE` — la clave de cifrado

Una frase larga (4–6 palabras al azar, ej. `lavado-noche-cometa-verde-2026-sm`). **Guardarla en
dos lugares fuera del computador** (gestor de contraseñas + papel en la caja fuerte). Si se
pierde, todos los respaldos quedan inservibles; si se cambia, los respaldos anteriores siguen
necesitando la clave vieja.

### 1.4 Opcionales (Settings → Variables → Actions)

| Variable | Default | Para qué |
|---|---|---|
| `RESPALDO_DRIVE_CARPETA` | `Respaldos Lavadero SM` | Nombre de la carpeta en Drive |
| `RESPALDO_MIN_BYTES` | `50000` | Tamaño mínimo aceptable del archivo cifrado |

### 1.5 Primera ejecución

```bash
gh workflow run respaldo-diario.yml          # primer respaldo
gh run watch                                 # seguirlo en vivo
gh workflow run prueba-restauracion.yml      # probar que se puede restaurar
```

O desde GitHub → Actions → elegir el workflow → *Run workflow*. Revisar que en Drive aparezca
`Respaldos Lavadero SM/diario/lavadero-sm_AAAA-MM-DD_HHMM.tar.gz.gpg` y que la prueba de
restauración termine en verde.

---

## 2. Operación

- **Respaldo manual** (ej. antes de un cambio grande): Actions → *Respaldo diario* → *Run workflow*.
- **"Pesa menos de la mitad del anterior"**: el respaldo NO se subió a propósito. Revisar si se
  borró o anuló algo masivo. Si el cambio es legítimo, correrlo a mano marcando *forzar*.
- **Llegó el correo "Respaldo fallido"**: abrir el enlace del issue, ver el paso que falló. Lo
  más común: contraseña de la base cambiada (actualizar `SUPABASE_DB_URL`) o permiso de Drive
  revocado (repetir 1.2).
- **GitHub apaga las tareas programadas** de repos públicos tras 60 días sin actividad; cada
  respaldo las vuelve a habilitar, pero si llega un correo de GitHub avisando que se van a
  desactivar, basta con entrar a Actions y re-activarlas.
- **Supabase gratis pausa el proyecto** tras 7 días sin actividad. El respaldo diario se conecta
  a la base todos los días, lo que ayuda, pero no es una garantía oficial de Supabase.

---

## 3. Restaurar (emergencia)

Se restaura en un **proyecto Supabase nuevo** (el plan gratuito permite dos proyectos), nunca
encima de producción — el script se niega si detecta la URL de producción.

Requisitos en el PC: Git Bash, Docker Desktop encendido y `gpg` (viene con Git Bash).

1. Crear un proyecto nuevo en Supabase (región cercana, Postgres 17) y copiar su cadena
   **Session pooler** con la contraseña, igual que en 1.1.
2. Bajar de Drive el respaldo a restaurar (normalmente el más reciente de `diario/`).
3. Desde la raíz del repo, en Git Bash:

   ```bash
   export RESPALDO_CLAVE='la clave de cifrado'
   export DESTINO_DB_URL='postgresql://postgres.<ref-nuevo>:<clave>@aws-0-...pooler.supabase.com:5432/postgres'
   bash scripts/respaldo/restaurar.sh ~/Downloads/lavadero-sm_AAAA-MM-DD_HHMM.tar.gz.gpg
   ```

   Termina con `✓ Restauración verificada: N tablas con los mismos conteos que el respaldo`.
4. Volver a desplegar las Edge Functions (crear/restablecer usuarios):
   `supabase link --project-ref <ref-nuevo>` y `supabase functions deploy`.
5. En Vercel, cambiar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` por los del proyecto nuevo
   y volver a desplegar.
6. Todos entran con su misma contraseña de siempre (los datos de login se restauran), pero las
   sesiones abiertas se cierran: cada persona inicia sesión de nuevo.

**Solo mirar un respaldo** (sin restaurar):

```bash
gpg --decrypt lavadero-sm_AAAA-MM-DD_HHMM.tar.gz.gpg | tar -xz
```

Deja una carpeta con `estructura.sql`, `datos.sql`, `usuarios.sql`, `migraciones.sql`,
`triggers_auth.sql`, `conteos.csv` (filas por tabla) y `LEEME.txt`.

---

## 4. Registro de pruebas de restauración

Cada ejecución de *Prueba de restauración* deja su resultado en GitHub → Actions → *Prueba de
restauración* (resumen de la ejecución). Ese historial es la constancia documentada que pide el
Plan de Alcance §9 antes de la puesta en producción.
