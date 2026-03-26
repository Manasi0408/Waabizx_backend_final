const { Op } = require('sequelize');
const { Contact, InboxMessage } = require('../models');

function phoneVariants(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return [];
  const noPlus = raw.replace(/^\+/, '');
  return [...new Set([raw, noPlus, `+${noPlus}`].filter(Boolean))];
}

/**
 * Record an outbound send for dashboard "messages sent today" and inbox parity.
 * Uses contact.userId (account owner) so owner dashboards include agent sends.
 */
async function recordOutboundInboxMessage(phone, messageBody, opts = {}) {
  const { type = 'text', status = 'sent', waMessageId = null } = opts;
  const variants = phoneVariants(phone);
  if (variants.length === 0) return;

  try {
    const contact = await Contact.findOne({
      where: { phone: { [Op.in]: variants } },
    });
    if (!contact || contact.userId == null) return;

    await InboxMessage.create({
      contactId: contact.id,
      userId: contact.userId,
      direction: 'outgoing',
      message: String(messageBody != null ? messageBody : '').slice(0, 65000) || '(no text)',
      type,
      status,
      waMessageId,
      timestamp: new Date(),
    });
  } catch (e) {
    console.error('recordOutboundInboxMessage:', e?.message || e);
  }
}

module.exports = { recordOutboundInboxMessage, phoneVariants };
