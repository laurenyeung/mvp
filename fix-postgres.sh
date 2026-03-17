#!/bin/bash

# ─────────────────────────────────────────────────────────────────────────────
# FitTrack — PostgreSQL setup
# Uninstalls broken postgresql@18, installs official postgresql@16,
# initialises the cluster, starts it, creates the DB, and writes server/.env
# Run from the project root: bash fix-postgres.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BREW_PREFIX="$(brew --prefix)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FitTrack — PostgreSQL Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Remove broken postgresql@18 ───────────────────────────────────────────
echo ""
echo "🧹 Removing broken postgresql@18..."
brew services stop postgresql@18 2>/dev/null || true
brew unlink postgresql@18 2>/dev/null || true
brew uninstall postgresql@18 --force 2>/dev/null || true
echo "   Done."

# ── 2. Install official postgresql@16 ────────────────────────────────────────
echo ""
echo "📦 Installing postgresql@16 (official Homebrew formula)..."
if brew list postgresql@16 &>/dev/null 2>&1; then
  echo "   Already installed."
else
  brew install postgresql@16
fi

PG_FORMULA="postgresql@16"
PG_PREFIX="$BREW_PREFIX/opt/$PG_FORMULA"
PGCTL="$PG_PREFIX/bin/pg_ctl"
INITDB="$PG_PREFIX/bin/initdb"
PSQL="$PG_PREFIX/bin/psql"
CREATEDB="$PG_PREFIX/bin/createdb"
PG_DATA="$BREW_PREFIX/var/$PG_FORMULA"
PG_LOG="$PG_DATA/server.log"

echo "   Prefix  : $PG_PREFIX"
echo "   Data dir: $PG_DATA"

# Verify share files exist before proceeding
BKI="$PG_PREFIX/share/$PG_FORMULA/postgres.bki"
if [ ! -f "$BKI" ]; then
  # Some Homebrew layouts put it here instead
  BKI="$PG_PREFIX/share/postgresql/postgres.bki"
fi
if [ ! -f "$BKI" ]; then
  echo "❌  Share files still missing after install: $BKI"
  echo "    Try: brew reinstall postgresql@16"
  exit 1
fi
echo "   Share files: ✅"

# ── 3. Stop any running instance ─────────────────────────────────────────────
echo ""
echo "🛑 Stopping any running PostgreSQL instance..."
"$PGCTL" -D "$PG_DATA" stop -m fast 2>/dev/null && echo "   Stopped." || echo "   Nothing running."
sleep 1

# ── 4. Initialise data directory if needed ───────────────────────────────────
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo ""
  echo "📂 Initialising PostgreSQL data directory..."
  mkdir -p "$PG_DATA"
  "$INITDB" --pgdata="$PG_DATA" --encoding=UTF8 --locale=C --auth=trust
  echo "✅  Cluster initialised."
else
  echo ""
  echo "✅  Data directory already initialised (version: $(cat "$PG_DATA/PG_VERSION"))."
fi

# ── 5. Configure socket directory ────────────────────────────────────────────
SOCKET_DIR="$BREW_PREFIX/var/run/postgresql"
mkdir -p "$SOCKET_DIR"
CONF="$PG_DATA/postgresql.conf"

if grep -q "^unix_socket_directories" "$CONF"; then
  sed -i.bak "s|^unix_socket_directories.*|unix_socket_directories = '$SOCKET_DIR'|" "$CONF"
else
  echo "unix_socket_directories = '$SOCKET_DIR'" >> "$CONF"
fi
echo "   Socket dir: $SOCKET_DIR"

# ── 6. Start PostgreSQL ───────────────────────────────────────────────────────
echo ""
echo "🚀 Starting PostgreSQL..."
"$PGCTL" -D "$PG_DATA" -l "$PG_LOG" start

echo "   Waiting for PostgreSQL to accept connections..."
for i in $(seq 1 20); do
  if "$PSQL" -h "$SOCKET_DIR" -U "$(whoami)" -d postgres -c "SELECT 1" &>/dev/null 2>&1; then
    echo "✅  PostgreSQL is ready."
    break
  fi
  sleep 1
  if [ "$i" -eq 20 ]; then
    echo "❌  PostgreSQL didn't become ready after 20 seconds."
    echo "    Check the log: cat $PG_LOG"
    exit 1
  fi
done

# ── 7. Create the database ────────────────────────────────────────────────────
echo ""
echo "🗄️  Creating 'fittrack' database..."
"$CREATEDB" -h "$SOCKET_DIR" -U "$(whoami)" fittrack 2>/dev/null \
  && echo "✅  Database 'fittrack' created." \
  || echo "ℹ️  Already exists — skipping."

# ── 8. Detect port and write .env ─────────────────────────────────────────────
PG_PORT=$(grep -E "^#?port\s*=" "$CONF" | head -1 | grep -oE '[0-9]+' || echo "5432")
DB_URL="postgresql://$(whoami)@localhost:${PG_PORT}/fittrack?host=${SOCKET_DIR}"
JWT_SECRET="$(openssl rand -hex 32)"

cat > "$SCRIPT_DIR/server/.env" <<EOF
DATABASE_URL=${DB_URL}
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRES_IN=7d
PORT=4000
AWS_REGION=us-east-1
AWS_BUCKET=fittrack-media
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅  All done! server/.env written."
echo ""
echo "   DATABASE_URL=${DB_URL}"
echo ""
echo "▶️  Next steps:"
echo ""
echo "   cd server && npm install && npm run migrate"
echo ""
echo "   Then open two terminals:"
echo "   [1]  cd server && npm run dev     # API  → http://localhost:4000"
echo "   [2]  npm install && npm run dev   # App  → http://localhost:3000"
echo ""
echo "💡 To restart PostgreSQL after a reboot:"
echo "   $PGCTL -D $PG_DATA -l $PG_LOG start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
