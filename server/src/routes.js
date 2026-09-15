const express = require('express');
const crypto = require('crypto');
const { getBorrowersCollection } = require('./db');

const router = express.Router();

function generateId() {
  return crypto.randomUUID();
}

function toBorrower(doc) {
  if (!doc) return null;
  return {
    id: doc._id,
    name: doc.name,
    phone: doc.phone,
    notes: doc.notes,
    createdAt: doc.createdAt,
    loans: doc.loans || [],
  };
}

/** Full sync: every borrower with every loan and its full payment schedule. */
router.get('/data', async (req, res) => {
  try {
    const docs = await getBorrowersCollection().find({}).toArray();
    res.json({ ok: true, borrowers: docs.map(toBorrower) });
  } catch (e) {
    console.error('GET /data failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/** Lightweight: loan info only, payment rows stripped out, for list screens. */
router.get('/borrowers', async (req, res) => {
  try {
    const docs = await getBorrowersCollection()
      .find({}, { projection: { 'loans.payments': 0 } })
      .toArray();
    res.json({ ok: true, borrowers: docs.map(toBorrower) });
  } catch (e) {
    console.error('GET /borrowers failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/** One loan, fully expanded with its payments. */
router.get('/loans/:loanId', async (req, res) => {
  try {
    const doc = await getBorrowersCollection().findOne({ 'loans.id': req.params.loanId });
    if (!doc) return res.status(404).json({ ok: false, reason: 'not_found' });
    const loan = doc.loans.find((l) => l.id === req.params.loanId);
    res.json({ ok: true, loan, borrowerId: doc._id, borrowerName: doc.name });
  } catch (e) {
    console.error('GET /loans/:loanId failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/**
 * Creates a new loan, including its payment schedule, in a single request
 * (no chunking needed over plain HTTP, unlike the old Sheets integration).
 * Creates the borrower document too if borrowerId is new or absent.
 * body.loan: { loanId?, borrowerId?, borrowerName, phone?, borrowerNotes?,
 *   createdAt?, principal, interestRate, startDate, tenure?, nextDueDate?,
 *   repaymentMode?, loanNotes?, payments? }
 */
router.post('/loans', async (req, res) => {
  try {
    const loan = req.body?.loan;
    if (!loan || loan.principal == null || loan.interestRate == null || !loan.startDate) {
      return res.status(400).json({
        ok: false,
        reason: 'invalid_response',
        message: 'loan.principal, loan.interestRate, and loan.startDate are required',
      });
    }

    const loanId = loan.loanId || generateId();
    const loanDoc = {
      id: loanId,
      principal: loan.principal,
      interestRate: loan.interestRate,
      startDate: loan.startDate,
      tenure: loan.tenure,
      nextDueDate: loan.nextDueDate,
      repaymentMode: loan.repaymentMode,
      notes: loan.loanNotes,
      payments: loan.payments || [],
    };

    const borrowers = getBorrowersCollection();
    let borrowerId = loan.borrowerId || null;

    if (borrowerId) {
      const result = await borrowers.updateOne(
        { _id: borrowerId },
        { $push: { loans: loanDoc } },
      );
      if (result.matchedCount === 0) borrowerId = null; // no such borrower yet - create below
    }

    if (!borrowerId) {
      borrowerId = loan.borrowerId || generateId();
      await borrowers.insertOne({
        _id: borrowerId,
        name: loan.borrowerName,
        phone: loan.phone,
        notes: loan.borrowerNotes,
        createdAt: loan.createdAt || new Date().toISOString(),
        loans: [loanDoc],
      });
    }

    res.json({ ok: true, loanId, borrowerId });
  } catch (e) {
    console.error('POST /loans failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/** Updates loan-level fields (principal/rate/dates/mode) for one loan. */
router.put('/loans/:loanId', async (req, res) => {
  try {
    const loan = req.body?.loan || {};
    const set = {};
    if (loan.principal !== undefined) set['loans.$.principal'] = loan.principal;
    if (loan.interestRate !== undefined) set['loans.$.interestRate'] = loan.interestRate;
    if (loan.startDate !== undefined) set['loans.$.startDate'] = loan.startDate;
    if (loan.tenure !== undefined) set['loans.$.tenure'] = loan.tenure;
    if (loan.nextDueDate !== undefined) set['loans.$.nextDueDate'] = loan.nextDueDate;
    if (loan.repaymentMode !== undefined) set['loans.$.repaymentMode'] = loan.repaymentMode;
    if (loan.loanNotes !== undefined) set['loans.$.notes'] = loan.loanNotes;

    const result = await getBorrowersCollection().updateOne(
      { 'loans.id': req.params.loanId },
      { $set: set },
    );
    if (result.matchedCount === 0) return res.status(404).json({ ok: false, reason: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /loans/:loanId failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/** Updates borrower-level fields (name/phone/notes). body.borrower: { name?, phone?, notes? } */
router.put('/borrowers/:borrowerId', async (req, res) => {
  try {
    const borrower = req.body?.borrower || {};
    const set = {};
    if (borrower.name !== undefined) set.name = borrower.name;
    if (borrower.phone !== undefined) set.phone = borrower.phone;
    if (borrower.notes !== undefined) set.notes = borrower.notes;

    const result = await getBorrowersCollection().updateOne(
      { _id: req.params.borrowerId },
      { $set: set },
    );
    if (result.matchedCount === 0) return res.status(404).json({ ok: false, reason: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /borrowers/:borrowerId failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/** Overwrites the full payment schedule for a loan in one request. */
router.put('/loans/:loanId/payments', async (req, res) => {
  try {
    const payments = req.body?.payments || [];
    const result = await getBorrowersCollection().updateOne(
      { 'loans.id': req.params.loanId },
      { $set: { 'loans.$.payments': payments } },
    );
    if (result.matchedCount === 0) return res.status(404).json({ ok: false, reason: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /loans/:loanId/payments failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/** Updates a single installment (e.g. marking it paid) without touching the rest. */
router.put('/loans/:loanId/payments/:dueNumber', async (req, res) => {
  try {
    const updates = req.body?.updates || {};
    const dueNumber = Number(req.params.dueNumber);

    const set = {};
    for (const key of ['paidDate', 'paidAmount', 'delayDays', 'delayInterest']) {
      if (updates[key] !== undefined) set[`loans.$[loan].payments.$[payment].${key}`] = updates[key];
    }

    const result = await getBorrowersCollection().updateOne(
      { 'loans.id': req.params.loanId },
      { $set: set },
      { arrayFilters: [{ 'loan.id': req.params.loanId }, { 'payment.dueNumber': dueNumber }] },
    );
    if (result.matchedCount === 0) return res.status(404).json({ ok: false, reason: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /loans/:loanId/payments/:dueNumber failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/** Removes one loan; also drops the borrower entirely once they have no loans left. */
router.delete('/loans/:loanId', async (req, res) => {
  try {
    const borrowers = getBorrowersCollection();
    const result = await borrowers.updateOne(
      { 'loans.id': req.params.loanId },
      { $pull: { loans: { id: req.params.loanId } } },
    );
    if (result.matchedCount === 0) return res.status(404).json({ ok: false, reason: 'not_found' });

    await borrowers.deleteMany({ loans: { $size: 0 } });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /loans/:loanId failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

/** Removes a borrower and every loan they have. */
router.delete('/borrowers/:borrowerId', async (req, res) => {
  try {
    const result = await getBorrowersCollection().deleteOne({ _id: req.params.borrowerId });
    if (result.deletedCount === 0) return res.status(404).json({ ok: false, reason: 'not_found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /borrowers/:borrowerId failed', e);
    res.status(500).json({ ok: false, reason: 'api_error', message: String(e) });
  }
});

module.exports = router;
