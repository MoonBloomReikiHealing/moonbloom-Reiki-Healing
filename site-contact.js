const applyLocalizedPricing = (currency) => {
  const isEuro = currency === 'EUR';
  const symbol = isEuro ? '€' : '£';
  const priceKey = isEuro ? 'priceEur' : 'priceGbp';

  document.querySelectorAll('[data-price-gbp][data-price-eur]').forEach((price) => {
    price.textContent = `${symbol}${price.dataset[priceKey]}`;
  });

  document.querySelectorAll('option[data-session-name]').forEach((option) => {
    const details = [option.dataset.sessionName, option.dataset.duration, `${symbol}${option.dataset[priceKey]}`];
    option.textContent = details.filter(Boolean).join(' — ');
  });

  const note = document.getElementById('pricing-region-note');
  if (note) {
    note.textContent = isEuro
      ? 'Prices shown in EUR for visitors in Europe.'
      : 'Prices shown in GBP. European visitors see EUR pricing automatically.';
  }
};

const applyWhatsAppLink = (whatsappUrl) => {
  if (!whatsappUrl) return;

  document.querySelectorAll('[data-whatsapp-link]').forEach((link) => {
    link.href = whatsappUrl;
    link.hidden = false;
  });
};

fetch('/api/pricing-region', { headers: { Accept: 'application/json' } })
  .then((response) => {
    if (!response.ok) throw new Error('Location lookup failed');
    return response.json();
  })
  .then(({ currency, whatsappUrl }) => {
    applyLocalizedPricing(currency);
    applyWhatsAppLink(whatsappUrl);
  })
  .catch(() => {
    applyLocalizedPricing('GBP');
  });
