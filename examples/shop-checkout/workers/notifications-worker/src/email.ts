import { ServerClient } from "postmark";

const postmark = new ServerClient(process.env.POSTMARK_TOKEN!);

export async function sendOrderConfirmation(order: OrderWithItems) {
  await postmark.sendEmailWithTemplate({
    From: "orders@shop.example",
    To: order.customerEmail,
    TemplateAlias: "order-confirmed",
    TemplateModel: { orderId: order.id, total: order.total, items: order.items },
    MessageStream: "outbound",
  });
}
