import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Sends email through SMTP when configured. In development it writes each message
 * to server/outbox/*.html so receipts can be inspected without a mail server.
 * mode 'memory' (tests) keeps messages in an array.
 */
export function createMailer(config, { mode } = {}) {
  const m = mode || config.mail.mode;
  const sent = [];
  let transport = null;
  if (m === 'smtp') {
    transport = nodemailer.createTransport({
      host: config.mail.host, port: config.mail.port,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined
    });
  }
  const money = (cents) =>
    (cents / 100).toLocaleString(config.locale, { style: 'currency', currency: config.currency });

  async function send({ to, subject, html }) {
    const message = { from: config.mail.from, to, subject, html };
    try {
      if (m === 'smtp') await transport.sendMail(message);
      else if (m === 'file') {
        fs.mkdirSync(config.mail.outboxDir, { recursive: true });
        const name = `${Date.now()}-${to.replace(/[^a-z0-9]+/gi, '_')}.html`;
        fs.writeFileSync(path.join(config.mail.outboxDir, name), `<!-- To: ${esc(to)} | Subject: ${esc(subject)} -->\n${html}`);
      } else sent.push(message);
    } catch (err) {
      // A failed email must never fail the order.
      console.error('[mail] could not send:', err.message);
    }
  }

  function orderTable(order) {
    const rows = order.items
      .map((i) => `<tr><td>${esc(i.name)}<br><small>${esc(i.sku)}</small></td><td align="center">${i.qty}</td><td align="right">${money(i.unitPriceCents * i.qty)}</td></tr>`)
      .join('');
    return `<table width="100%" cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
      <tr style="background:#eef1f4"><th align="left">Item</th><th>Qty</th><th align="right">Amount</th></tr>${rows}
      <tr><td colspan="2" align="right">Subtotal</td><td align="right">${money(order.subtotalCents)}</td></tr>
      ${order.discountCents ? `<tr><td colspan="2" align="right">Discount ${esc(order.couponCode || '')}</td><td align="right">-${money(order.discountCents)}</td></tr>` : ''}
      <tr><td colspan="2" align="right">Shipping</td><td align="right">${order.shippingCents ? money(order.shippingCents) : 'Free'}</td></tr>
      <tr><td colspan="2" align="right">Tax</td><td align="right">${money(order.taxCents)}</td></tr>
      <tr><td colspan="2" align="right"><b>Total</b></td><td align="right"><b>${money(order.totalCents)}</b></td></tr></table>`;
  }

  const addr = (a) => [a.fullName, a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`, a.phone].filter(Boolean).map(esc).join('<br>');

  return {
    sent,
    async sendReceipt(order) {
      const html = `<div style="font-family:sans-serif;max-width:560px">
        <h2>Thanks for your order, ${esc(order.shippingAddress.fullName)}</h2>
        <p>Order <b>${esc(order.number)}</b> is confirmed. We will email you again when it ships.</p>
        ${orderTable(order)}<h3>Shipping to</h3><p>${addr(order.shippingAddress)}</p>
        <p>${esc(config.storeName)}</p></div>`;
      await send({ to: order.email, subject: `Your ${config.storeName} order ${order.number}`, html });
      const merchantHtml = `<div style="font-family:sans-serif;max-width:560px"><h2>New order ${esc(order.number)}</h2>
        <p>Customer: ${esc(order.email)}</p>${orderTable(order)}<h3>Ship to</h3><p>${addr(order.shippingAddress)}</p></div>`;
      await send({ to: config.merchantEmail, subject: `New order ${order.number} (${money(order.totalCents)})`, html: merchantHtml });
    },
    async sendShipped(order) {
      const html = `<div style="font-family:sans-serif;max-width:560px"><h2>Your order is on its way</h2>
        <p>Order <b>${esc(order.number)}</b> shipped with <b>${esc(order.carrier)}</b>.</p>
        <p>Tracking number: <b>${esc(order.trackingNumber)}</b></p></div>`;
      await send({ to: order.email, subject: `Order ${order.number} has shipped`, html });
    },
    async sendCancelled(order) {
      const html = `<div style="font-family:sans-serif;max-width:560px"><h2>Order ${esc(order.number)} cancelled</h2>
        <p>${order.paymentStatus === 'refunded' ? 'Your payment has been refunded.' : order.paymentStatus === 'refund_pending' ? 'Your refund is being processed.' : 'You have not been charged.'}</p></div>`;
      await send({ to: order.email, subject: `Order ${order.number} cancelled`, html });
    }
  };
}
