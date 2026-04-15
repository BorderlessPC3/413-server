import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MercadoPagoConfig, Preference } from "mercadopago";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

const mpAccessToken = process.env.MP_ACCESS_TOKEN;
if (!mpAccessToken) {
  console.error("MP_ACCESS_TOKEN nao configurado no .env");
  process.exit(1);
}

const serverApiKey = process.env.SERVER_API_KEY;
const frontendUrl = process.env.FRONTEND_URL;
const notificationUrl = process.env.MP_NOTIFICATION_URL;
const successUrl = process.env.MP_SUCCESS_URL || frontendUrl;
const pendingUrl = process.env.MP_PENDING_URL || frontendUrl;
const failureUrl = process.env.MP_FAILURE_URL || frontendUrl;

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origem nao permitida pelo CORS"));
    }
  })
);
app.use(express.json());

// cliente Mercado Pago (SDK novo)
const client = new MercadoPagoConfig({
  accessToken: mpAccessToken
});

function requireApiKey(req, res, next) {
  if (!serverApiKey) return next();
  const requestApiKey = req.header("x-api-key");
  if (requestApiKey !== serverApiKey) {
    return res.status(401).json({ error: "nao autorizado" });
  }
  return next();
}

function isValidAmount(value) {
  return Number.isFinite(value) && value > 0;
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "payments-server" });
});

app.post("/create-payment", requireApiKey, async (req, res) => {
  const { amount, service_id, user_id } = req.body;
  const parsedAmount = Number(amount);

  if (!isValidAmount(parsedAmount)) {
    return res.status(400).json({ error: "amount invalido" });
  }

  if (!service_id || !user_id) {
    return res.status(400).json({ error: "service_id e user_id sao obrigatorios" });
  }

  try {
    const preference = new Preference(client);

    const preferenceBody = {
      items: [
        {
          title: `Servico ${service_id}`,
          quantity: 1,
          unit_price: parsedAmount,
          currency_id: "BRL"
        }
      ],
      metadata: {
        service_id,
        user_id
      },
      back_urls: {
        success: successUrl,
        pending: pendingUrl,
        failure: failureUrl
      },
      auto_return: "approved"
    };

    if (notificationUrl) {
      preferenceBody.notification_url = notificationUrl;
    }

    const result = await preference.create({
      body: preferenceBody
    });

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point
    });
  } catch (error) {
    console.error("Erro ao criar pagamento:", error.message);
    res.status(500).json({ error: "erro ao criar pagamento" });
  }
});

app.post("/webhook/mercadopago", async (req, res) => {
  // Rota para receber notificacoes do Mercado Pago.
  // Aqui voce pode salvar o evento e consultar a API para confirmar status.
  console.log("Webhook Mercado Pago recebido:", req.body);
  return res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Servidor de pagamento rodando na porta ${port}`);
});