import app from './app.js'
const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`\n  RFQ Hub API  →  http://localhost:${PORT}/api`)
  console.log(`  AI engine    →  ${process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-5.4-mini') + ' + ' + (process.env.OPENAI_CLUB_MODEL || 'gpt-5.5') + ' (clubbing)' : 'fallback (no OPENAI_API_KEY)'}\n`)
})
