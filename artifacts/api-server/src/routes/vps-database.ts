import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vpsDatabaseConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/vps-database/config", async (_req, res): Promise<void> => {
  let [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
  if (!config) {
    [config] = await db.insert(vpsDatabaseConfigTable).values({}).returning();
  }
  const { password, ...safe } = config;
  res.json({ ...safe, password: password ? "••••••••" : "" });
});

router.put("/vps-database/config", async (req, res): Promise<void> => {
  const { host, port, database, username, password, sslEnabled, sslMode, sslCaCert, sslClientCert, sslClientKey, sslRejectUnauthorized, isActive } = req.body;
  let [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);

  const updates: any = {};
  if (host !== undefined) updates.host = host;
  if (port !== undefined) updates.port = String(port);
  if (database !== undefined) updates.database = database;
  if (username !== undefined) updates.username = username;
  if (password !== undefined && password !== "••••••••") updates.password = password;
  if (sslEnabled !== undefined) updates.sslEnabled = sslEnabled;
  if (sslMode !== undefined) updates.sslMode = sslMode;
  if (sslCaCert !== undefined) updates.sslCaCert = sslCaCert;
  if (sslClientCert !== undefined) updates.sslClientCert = sslClientCert;
  if (sslClientKey !== undefined) updates.sslClientKey = sslClientKey;
  if (sslRejectUnauthorized !== undefined) updates.sslRejectUnauthorized = sslRejectUnauthorized;
  if (isActive !== undefined) updates.isActive = isActive;

  if (!config) {
    [config] = await db.insert(vpsDatabaseConfigTable).values(updates).returning();
  } else {
    [config] = await db.update(vpsDatabaseConfigTable).set(updates).where(eq(vpsDatabaseConfigTable.id, config.id)).returning();
  }

  const { password: pw, ...safe } = config;
  res.json({ ...safe, password: pw ? "••••••••" : "" });
});

router.post("/vps-database/test", async (_req, res): Promise<void> => {
  let [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
  if (!config || !config.password) {
    res.status(400).json({ success: false, error: "VPS database not configured. Please set host, database, username, and password first." });
    return;
  }

  try {
    const { default: pg } = await import("pg");
    const clientOptions: any = {
      host: config.host,
      port: parseInt(config.port),
      database: config.database,
      user: config.username,
      password: config.password,
      connectionTimeoutMillis: 10000,
    };

    if (config.sslEnabled) {
      clientOptions.ssl = {
        rejectUnauthorized: config.sslRejectUnauthorized,
      };
      if (config.sslCaCert) clientOptions.ssl.ca = config.sslCaCert;
      if (config.sslClientCert) clientOptions.ssl.cert = config.sslClientCert;
      if (config.sslClientKey) clientOptions.ssl.key = config.sslClientKey;
    }

    const client = new pg.Client(clientOptions);
    await client.connect();
    const result = await client.query("SELECT version(), current_database(), current_user, pg_database_size(current_database()) as db_size");
    await client.end();

    const row = result.rows[0];
    const testResult = `Connected! PostgreSQL ${row.version.split(" ")[1]} | DB: ${row.current_database} | User: ${row.current_user} | Size: ${(parseInt(row.db_size) / 1024 / 1024).toFixed(1)} MB`;

    await db.update(vpsDatabaseConfigTable)
      .set({ lastTestedAt: new Date(), lastTestResult: testResult })
      .where(eq(vpsDatabaseConfigTable.id, config.id));

    res.json({ success: true, message: testResult, version: row.version, database: row.current_database, user: row.current_user, sizeBytes: parseInt(row.db_size) });
  } catch (err: any) {
    const errorMsg = err?.message || "Connection failed";

    await db.update(vpsDatabaseConfigTable)
      .set({ lastTestedAt: new Date(), lastTestResult: `FAILED: ${errorMsg}` })
      .where(eq(vpsDatabaseConfigTable.id, config.id));

    res.json({ success: false, error: errorMsg });
  }
});

router.get("/vps-database/setup-script", async (_req, res): Promise<void> => {
  let [config] = await db.select().from(vpsDatabaseConfigTable).limit(1);
  if (!config) {
    [config] = await db.insert(vpsDatabaseConfigTable).values({}).returning();
  }

  const sanitize = (val: string) => val.replace(/[^a-zA-Z0-9_.-]/g, "");
  const dbName = sanitize(config.database || "llmhub");
  const dbUser = sanitize(config.username || "llmhub");
  const dbPort = sanitize(config.port || "5432");

  const script = `#!/bin/bash
set -e

echo "============================================"
echo "  PostgreSQL Setup Script for VPS"
echo "  Target: $(hostname) ($(curl -s ifconfig.me 2>/dev/null || echo 'unknown'))"
echo "============================================"
echo ""

DB_NAME="${dbName}"
DB_USER="${dbUser}"
DB_PORT="${dbPort}"

# Prompt for password — never hardcoded in scripts
read -sp "Enter password for PostgreSQL user '$DB_USER': " DB_PASS
echo ""
if [ -z "$DB_PASS" ]; then
    echo "[ERROR] Password cannot be empty."
    exit 1
fi

# 1. Install PostgreSQL
echo "[1/6] Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
    sudo apt update
    sudo apt install -y postgresql postgresql-contrib
    echo "[INFO] PostgreSQL installed."
else
    echo "[INFO] PostgreSQL already installed."
    psql --version
fi

# 2. Start and enable PostgreSQL
echo "[2/6] Starting PostgreSQL service..."
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 3. Create database and user
echo "[3/6] Creating database and user..."
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \\
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \\
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"
echo "[INFO] Database '$DB_NAME' and user '$DB_USER' ready."

# 4. Configure remote access
echo "[4/6] Configuring remote access..."
PG_VERSION=$(psql --version | grep -oP '\\d+' | head -1)
PG_CONF="/etc/postgresql/$PG_VERSION/main/postgresql.conf"
PG_HBA="/etc/postgresql/$PG_VERSION/main/pg_hba.conf"

# Allow listening on all interfaces
if ! grep -q "^listen_addresses = '\\*'" "$PG_CONF"; then
    sudo sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" "$PG_CONF"
    echo "[INFO] Set listen_addresses to '*'"
fi

# Set port
sudo sed -i "s/^#port = 5432/port = $DB_PORT/" "$PG_CONF"
sudo sed -i "s/^port = .*/port = $DB_PORT/" "$PG_CONF"

# Allow password auth from any IP (scram-sha-256)
if ! grep -q "host.*all.*all.*0.0.0.0/0" "$PG_HBA"; then
    echo "host    all    all    0.0.0.0/0    scram-sha-256" | sudo tee -a "$PG_HBA" > /dev/null
    echo "[INFO] Added remote access rule to pg_hba.conf"
fi

# 5. Configure firewall
echo "[5/6] Configuring firewall..."
if command -v ufw &> /dev/null; then
    sudo ufw allow $DB_PORT/tcp
    echo "[INFO] Firewall rule added for port $DB_PORT"
else
    echo "[INFO] ufw not found, skipping firewall config. Make sure port $DB_PORT is open."
fi

# 6. Restart PostgreSQL
echo "[6/6] Restarting PostgreSQL..."
sudo systemctl restart postgresql

echo ""
echo "============================================"
echo "  PostgreSQL Setup Complete!"
echo "============================================"
echo ""
echo "Connection Details:"
echo "  Host:     $(curl -s ifconfig.me 2>/dev/null || echo '72.60.167.64')"
echo "  Port:     $DB_PORT"
echo "  Database: $DB_NAME"
echo "  Username: $DB_USER"
echo "  Password: (as entered above)"
echo ""
echo "Connection String (replace <PASSWORD> with your password):"
echo "  postgresql://$DB_USER:<PASSWORD>@$(curl -s ifconfig.me 2>/dev/null || echo '72.60.167.64'):$DB_PORT/$DB_NAME"
echo ""
echo "Test locally: psql -h localhost -p $DB_PORT -U $DB_USER -d $DB_NAME"
echo ""
echo "SECURITY NOTES:"
echo "  - Consider restricting pg_hba.conf to specific IP ranges"
echo "  - Enable SSL for encrypted connections"
echo ""
`;

  res.setHeader("Content-Type", "text/plain");
  res.send(script);
});

export default router;
