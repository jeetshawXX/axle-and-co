import Stripe from 'stripe';

/**
 * Payment gateway adapter.
 *  - With STRIPE_SECRET_KEY set, the order is paid on Stripe's hosted Checkout page,
 *    so card data never touches this server.
 *  - Without it we run a built-in sandbox that behaves like a gateway in test mode:
 *    card numbers are validated (Luhn, expiry, CVC) and only the last four digits are kept.
 */
export function createPayments(config) {
  const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;
  return {
    provider: stripe ? 'stripe' : 'mock',
    stripe,

    chargeMock(card, amountCents) {
      const number = String(card?.number || '').replace(/\D/g, '');
      if (!luhn(number)) return fail('Card number is not valid');
      const m = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(String(card?.expiry || '').trim());
      if (!m) return fail('Enter the expiry as MM/YY');
      const month = Number(m[1]);
      const year = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59);
      if (month < 1 || month > 12 || endOfMonth < new Date()) return fail('This card has expired');
      if (!/^\d{3,4}$/.test(String(card?.cvc || ''))) return fail('Enter the 3 or 4 digit security code');
      if (!String(card?.name || '').trim()) return fail('Enter the name on the card');
      if (number === '4000000000000002') return fail('Your card was declined by the bank');
      if (number === '4000000000009995') return fail('Your card has insufficient funds');
      if (amountCents <= 0) return fail('Nothing to charge');
      return { ok: true, ref: 'mock_ch_' + Math.random().toString(36).slice(2, 12), last4: number.slice(-4) };
    },

    async createStripeSession(order) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: order.email,
        client_reference_id: order.number,
        metadata: { order_number: order.number },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: config.currency.toLowerCase(),
            unit_amount: order.totalCents,
            product_data: { name: `${config.storeName} order ${order.number}` }
          }
        }],
        success_url: `${config.publicUrl}/order/${order.number}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.publicUrl}/checkout?cancelled=${order.number}`
      });
      return { id: session.id, url: session.url };
    },

    async retrieveStripeSession(id) {
      return stripe.checkout.sessions.retrieve(id);
    }
  };
}

const fail = (message) => ({ ok: false, message });

export function luhn(num) {
  if (!/^\d{12,19}$/.test(num)) return false;
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = Number(num[i]);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}
