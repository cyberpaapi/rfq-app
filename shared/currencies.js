export const DEFAULT_CURRENCIES = [
  ['AED', 'UAE dirham'], ['AUD', 'Australian dollar'], ['CAD', 'Canadian dollar'],
  ['CNY', 'Chinese yuan'], ['EUR', 'Euro'], ['GBP', 'British pound'],
  ['INR', 'Indian rupee'], ['JPY', 'Japanese yen'], ['LKR', 'Sri Lankan rupee'],
  ['MVR', 'Maldivian rufiyaa'], ['SAR', 'Saudi riyal'], ['SGD', 'Singapore dollar'],
  ['THB', 'Thai baht'], ['USD', 'US dollar'], ['ZAR', 'South African rand'],
]

export const seedCurrencies = () => DEFAULT_CURRENCIES.map(([code, name]) => ({ id: code, code, name, active: true, base: code === 'USD' }))
