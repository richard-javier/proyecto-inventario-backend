import nodemailer from "nodemailer";

const isProduction = process.env.NODE_ENV === "production";

const parseBoolean = (value) => String(value).toLowerCase() === "true";

export const getFrontendUrl = () => {
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

  if (isProduction && !frontendUrl.startsWith("https://")) {
    throw new Error("FRONTEND_URL debe usar HTTPS en producción.");
  }

  return frontendUrl;
};

export const getEmailFrom = () => {
  return process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER;
};

export const createMailTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const smtpSecure = parseBoolean(process.env.SMTP_SECURE);

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    if (isProduction) throw new Error("Faltan variables SMTP obligatorias.");
    return null;
  }

  const port = Number(SMTP_PORT);
  if (smtpSecure && port !== 465) {
    throw new Error("SMTP_SECURE=true requiere SMTP_PORT=465.");
  }

  if (!smtpSecure && port !== 587) {
    throw new Error("SMTP_SECURE=false requiere SMTP_PORT=587 para STARTTLS.");
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: smtpSecure,
    requireTLS: !smtpSecure,
    pool: parseBoolean(process.env.SMTP_POOL),
    rateLimit: process.env.SMTP_RATE_LIMIT ? Number(process.env.SMTP_RATE_LIMIT) : undefined,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  });

  transporter.verify((error) => {
    if (error) {
      console.error("No se pudo verificar la conexión SMTP:", error.message);
      return;
    }

    console.log("Conexión SMTP verificada con TLS.");
  });

  return transporter;
};

export const sendMail = async (mailOptions) => {
  const transporter = createMailTransporter();
  if (!transporter) return false;

  await transporter.sendMail({
    ...mailOptions,
    from: mailOptions.from || getEmailFrom(),
  });

  return true;
};
