const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONNIFY_BASE    = 'https://sandbox.monnify.com';
const API_KEY         = process.env.MONNIFY_API_KEY;
const SECRET_KEY      = process.env.MONNIFY_SECRET_KEY;
const CONTRACT_CODE   = process.env.MONNIFY_CONTRACT_CODE;

// ─── Get Monnify access token ─────────────────────────
async function getToken() {
  const credentials = Buffer.from(`${API_KEY}:${SECRET_KEY}`).toString('base64');
  const res = await axios.post(`${MONNIFY_BASE}/api/v1/auth/login`, {}, {
    headers: { Authorization: `Basic ${credentials}` }
  });
  return res.data.responseBody.accessToken;
}

// ─── DEPOSIT: Create reserved account ────────────────
app.post('/deposit', async (req, res) => {
  try {
    const { amount, customerName, customerEmail } = req.body;
    const token = await getToken();
    const reference = 'SAMMY_DEP_' + Date.now();

    const response = await axios.post(`${MONNIFY_BASE}/api/v2/bank-transfer/reserved-accounts`, {
      accountReference: reference,
      accountName: customerName || 'Sammy Player',
      currencyCode: 'NGN',
      contractCode: CONTRACT_CODE,
      customerEmail: customerEmail || 'player@sammy.app',
      customerName: customerName || 'Sammy Player',
      getAllAvailableBanks: false,
      preferredBanks: ['035'] // Wema Bank (ALAT)
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const body = response.data.responseBody;
    const account = body.accounts?.[0];

    res.json({
      success: true,
      reference: body.accountReference,
      accountNumber: account?.accountNumber || '—',
      bankName: account?.bankName || 'Wema Bank',
      accountName: body.accountName
    });
  } catch (err) {
    console.error('Deposit error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: err.response?.data?.responseMessage || err.message });
  }
});

// ─── VERIFY: Check if payment was received ────────────
app.get('/verify/:reference', async (req, res) => {
  try {
    const token = await getToken();
    const ref = req.params.reference;
    const response = await axios.get(
      `${MONNIFY_BASE}/api/v1/bank-transfer/reserved-accounts/transactions?accountReference=${encodeURIComponent(ref)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const transactions = response.data.responseBody?.content || [];
    const paid = transactions.some(t => t.paymentStatus === 'PAID');
    res.json({ paid, transactions });
  } catch (err) {
    console.error('Verify error:', err.response?.data || err.message);
    res.status(500).json({ paid: false, message: err.message });
  }
});

// ─── WITHDRAW: Send money to bank ────────────────────
app.post('/withdraw', async (req, res) => {
  try {
    const { amount, bankCode, accountNumber, accountName, narration } = req.body;
    const token = await getToken();
    const reference = 'SAMMY_WIT_' + Date.now();

    const response = await axios.post(`${MONNIFY_BASE}/api/v2/disbursements/single`, {
      amount,
      narration: narration || 'Sammy Withdrawal',
      destinationBankCode: bankCode,
      destinationAccountNumber: accountNumber,
      destinationAccountName: accountName,
      destinationNarration: 'Sammy Payout',
      sourceAccountNumber: CONTRACT_CODE,
      reference,
      currency: 'NGN'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error('Withdraw error:', err.response?.data || err.message);
    res.status(500).json({ success: false, message: err.response?.data?.responseMessage || err.message });
  }
});

// ─── HEALTH CHECK ────────────────────────────────────
app.get('/', (req, res) => res.send('Sammy Backend Running ✅'));

app.listen(process.env.PORT || 3000, () => console.log('Server started on port', process.env.PORT || 3000));
