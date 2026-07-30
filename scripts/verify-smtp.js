import dotenv from "dotenv";
import { createMailTransporter, getEmailFrom } from "../config/mailer.js";

dotenv.config();

const transporter = createMailTransporter();
if (!transporter) {
  console.error("SMTP no configurado. Revisa SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS.");
  process.exit(1);
}

await transporter.verify();
console.log("SMTP verificado correctamente.");

const testTo = process.env.SMTP_TEST_TO;
if (testTo) {
  await transporter.sendMail({
    from: getEmailFrom(),
    to: testTo,
    subject: "Prueba SMTP SINCOT",
    text: "La configuración SMTP de SINCOT está funcionando.",
  });
  console.log(`Correo de prueba enviado a ${testTo}.`);
}
