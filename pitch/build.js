// Builds a pitch deck (.pptx) for Vehicle FC Manager — senior management approval.
// Run:  node build.js
const Pptx = require('pptxgenjs')
const fs = require('fs')
const path = require('path')

const pptx = new Pptx()
pptx.layout = 'LAYOUT_WIDE'     // 13.33 x 7.5 in
pptx.title  = 'Vehicle FC Manager — Warehouse Pitch Deck'
pptx.author = 'Internal Technology Team'
pptx.company = 'Warehouse Operations'

// ── Theme ────────────────────────────────────────────────────────────────────
const THEME = {
  indigo:   '4338CA',
  indigoLt: 'EEF2FF',
  slate:    '1E293B',
  slateLt:  '64748B',
  gray:     'E2E8F0',
  grayBg:   'F8FAFC',
  white:    'FFFFFF',
  green:    '16A34A',
  greenLt:  'DCFCE7',
  amber:    'D97706',
  amberLt:  'FEF3C7',
  red:      'DC2626',
  redLt:    'FEE2E2',
  sky:      '0284C7',
  skyLt:    'E0F2FE',
  purple:   '7E22CE',
  purpleLt: 'F3E8FF',
}

// Master slide — footer + page number
pptx.defineSlideMaster({
  title: 'MAIN',
  background: { color: THEME.white },
  objects: [
    { rect:  { x: 0, y: 7.15, w: 13.33, h: 0.35, fill: { color: THEME.indigo } } },
    { text:  {
        text:    'Vehicle FC Manager  ·  Warehouse Deployment Proposal',
        options: { x: 0.35, y: 7.18, w: 9, h: 0.3, fontFace: 'Calibri', fontSize: 10, color: THEME.white, bold: true }
    } },
    { text:  {
        text:    'CONFIDENTIAL',
        options: { x: 11.4, y: 7.18, w: 1.6, h: 0.3, fontFace: 'Calibri', fontSize: 9, color: THEME.white, align: 'right' }
    } },
  ],
  slideNumber: { x: 12.7, y: 7.18, w: 0.55, h: 0.3, fontFace: 'Calibri', fontSize: 10, color: THEME.white, align: 'right', bold: true },
})

// ── Helpers ──────────────────────────────────────────────────────────────────
function titleBar(s, text, sub) {
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: THEME.indigo }, line: { color: THEME.indigo } })
  s.addText(text, {
    x: 0.45, y: 0.12, w: 12.4, h: 0.45,
    fontFace: 'Calibri', fontSize: 26, bold: true, color: THEME.white,
  })
  if (sub) {
    s.addText(sub, {
      x: 0.45, y: 0.55, w: 12.4, h: 0.32,
      fontFace: 'Calibri', fontSize: 13, color: 'C7D2FE',
    })
  }
}

function bigStat(s, x, y, w, h, value, label, color) {
  s.addShape('roundRect', {
    x, y, w, h,
    fill: { color: THEME.grayBg },
    line: { color: THEME.gray, width: 1 },
    rectRadius: 0.15,
  })
  s.addText(String(value), {
    x, y: y + 0.15, w, h: h * 0.55,
    fontFace: 'Calibri', fontSize: 36, bold: true,
    color: color || THEME.indigo, align: 'center', valign: 'middle',
  })
  s.addText(label, {
    x, y: y + h * 0.65, w, h: h * 0.3,
    fontFace: 'Calibri', fontSize: 11, bold: true,
    color: THEME.slateLt, align: 'center', valign: 'top',
  })
}

function bulletList(s, x, y, w, h, items, opts = {}) {
  const text = items.map(i => ({
    text: i,
    options: { bullet: { type: 'bullet' }, paraSpaceAfter: 6 },
  }))
  s.addText(text, {
    x, y, w, h,
    fontFace: 'Calibri',
    fontSize: opts.fontSize || 14,
    color: THEME.slate,
    valign: 'top',
  })
}

function featureCard(s, x, y, w, h, emoji, title, body, accent) {
  const fill = accent || THEME.indigoLt
  s.addShape('roundRect', {
    x, y, w, h,
    fill: { color: fill },
    line: { color: THEME.gray, width: 1 },
    rectRadius: 0.15,
  })
  s.addText(emoji, {
    x: x + 0.2, y: y + 0.15, w: 0.9, h: 0.6,
    fontSize: 28, align: 'left',
  })
  s.addText(title, {
    x: x + 1.05, y: y + 0.18, w: w - 1.2, h: 0.45,
    fontFace: 'Calibri', fontSize: 16, bold: true, color: THEME.slate,
  })
  s.addText(body, {
    x: x + 0.25, y: y + 0.85, w: w - 0.4, h: h - 1,
    fontFace: 'Calibri', fontSize: 12, color: THEME.slateLt,
    valign: 'top',
  })
}

// ── Slide 1 — Cover ──────────────────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: THEME.indigo } })
  s.addShape('rect', { x: 0, y: 5.3, w: 13.33, h: 2.2, fill: { color: '3730A3' } })

  s.addText('🚛', { x: 0.6, y: 1.8, w: 2.5, h: 2.5, fontSize: 140, align: 'center' })
  s.addText('Vehicle FC Manager', {
    x: 3.2, y: 2.0, w: 9.5, h: 1.2,
    fontFace: 'Calibri', fontSize: 58, bold: true, color: THEME.white,
  })
  s.addText('Real-time Dock & Gate Management for the Warehouse', {
    x: 3.2, y: 3.2, w: 9.5, h: 0.6,
    fontFace: 'Calibri', fontSize: 22, color: 'C7D2FE',
  })
  s.addText('A proposal for warehouse deployment approval', {
    x: 3.2, y: 3.85, w: 9.5, h: 0.45,
    fontFace: 'Calibri', fontSize: 16, color: 'A5B4FC', italic: true,
  })

  s.addText('Inbound · Outbound · Zero-paper workflows', {
    x: 0.6, y: 5.7, w: 12.1, h: 0.45,
    fontFace: 'Calibri', fontSize: 18, bold: true, color: THEME.white, align: 'center',
  })
  s.addText('Runs on the local network — no cloud dependency · Mobile-first UI', {
    x: 0.6, y: 6.2, w: 12.1, h: 0.4,
    fontFace: 'Calibri', fontSize: 13, color: 'C7D2FE', align: 'center',
  })
}

// ── Slide 2 — The problem today ──────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'The problem today', 'What breaks when vehicles arrive at the warehouse')

  const problems = [
    { e: '📋', t: 'Manual paper logs',       b: 'Gate, dock & security teams maintain separate registers. Matching them later is guesswork.' },
    { e: '📞', t: 'Phone-call coordination', b: 'Security calls supervisor, supervisor calls OM. No single source of truth while the vehicle waits.' },
    { e: '⏱️', t: 'No real-time visibility',  b: 'Ops manager can not tell which dock is free, which is busy, or which vehicle is stuck.' },
    { e: '🚫', t: 'No rejection workflow',    b: 'Damaged seals, wrong vehicles, dirty trucks — all handled over WhatsApp with no audit trail.' },
    { e: '📸', t: 'Photos scattered',         b: 'Seal / gate / stacking photos sit in different phones. No way to link them to a shipment.' },
    { e: '📊', t: 'No performance data',      b: 'Average unload time? Best-performing dock? Unknown. Zero data to improve throughput.' },
  ]
  const cardW = 4.1, cardH = 1.8
  problems.forEach((p, i) => {
    const col = i % 3, row = Math.floor(i / 3)
    const x = 0.5 + col * (cardW + 0.2)
    const y = 1.2 + row * (cardH + 0.25)
    featureCard(s, x, y, cardW, cardH, p.e, p.t, p.b, THEME.redLt)
  })

  s.addText('→ Every delay, every mismatch, every disputed claim costs money and trust.', {
    x: 0.5, y: 6.4, w: 12.3, h: 0.45,
    fontFace: 'Calibri', fontSize: 16, bold: true, italic: true, color: THEME.red, align: 'center',
  })
}

// ── Slide 3 — Our solution ───────────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Our solution', 'A single app that links Security, Dock Supervisors, and Operations in real time')

  s.addShape('roundRect', {
    x: 0.5, y: 1.15, w: 12.3, h: 1.1,
    fill: { color: THEME.indigoLt }, line: { color: THEME.indigo, width: 1 }, rectRadius: 0.15,
  })
  s.addText('One web app on your LAN → four role-based dashboards → live updates via socket.io', {
    x: 0.7, y: 1.28, w: 12, h: 0.4,
    fontFace: 'Calibri', fontSize: 16, bold: true, color: THEME.indigo, valign: 'middle',
  })
  s.addText('No cloud. No monthly SaaS fee. No app-store install. Anything with a browser is a terminal.', {
    x: 0.7, y: 1.72, w: 12, h: 0.4,
    fontFace: 'Calibri', fontSize: 13, italic: true, color: THEME.slateLt, valign: 'middle',
  })

  const features = [
    { e: '🔒', t: 'Gate Security',     b: 'Scans shipment QR, clicks vehicle photo, fills driver details. System auto-assigns a dock or queues the vehicle.', c: THEME.skyLt },
    { e: '🏭', t: 'Dock Supervisor',   b: 'Sees only their dock. Checks seal → opens gate (with photo) → marks offloaded. Can reject vehicles with reason + photo.', c: THEME.greenLt },
    { e: '📊', t: 'Operation Manager', b: 'Live dock scorecards, waiting queue, rejections approval workflow, performance by dock & supervisor, Excel exports.', c: THEME.purpleLt },
    { e: '🔧', t: 'Admin',             b: 'Full master control: docks, users, bulk Excel import, full history log, type configuration (inbound / outbound).', c: THEME.amberLt },
  ]

  const cardW = 2.95, cardH = 4.25, gap = 0.15
  features.forEach((f, i) => {
    const x = 0.5 + i * (cardW + gap)
    const y = 2.4
    featureCard(s, x, y, cardW, cardH, f.e, f.t, f.b, f.c)
  })

  s.addText('One shipment → one record → full trail from gate in to gate out.', {
    x: 0.5, y: 6.85, w: 12.3, h: 0.35,
    fontFace: 'Calibri', fontSize: 14, bold: true, italic: true, color: THEME.indigo, align: 'center',
  })
}

// ── Slide 4 — The end-to-end workflow ────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'End-to-end workflow', 'From gate arrival to gate departure — every step is logged')

  const stages = [
    { n: '1', c: '2563EB', t: 'ARRIVED',   d: 'Security scans shipment QR, snaps number-plate photo, adds driver details + purpose (inbound / outbound).' },
    { n: '2', c: 'F59E0B', t: 'QUEUED',    d: 'No free matching dock? Vehicle joins the waiting queue. Auto-assigns when a matching dock becomes free.' },
    { n: '3', c: 'F97316', t: 'ASSIGNED',  d: 'Dock allocated. Supervisor sees the vehicle on their screen. Driver gets a WhatsApp notification in his language.' },
    { n: '4', c: 'DC2626', t: 'GATE OPEN', d: 'Supervisor captures seal photo + gate-opened photo (inbound) OR empty-vehicle photo (outbound). Dock turns red.' },
    { n: '5', c: '16A34A', t: 'COMPLETED', d: 'Vehicle offloaded / loaded. Stacking photo captured. Dock turns green and the next queued vehicle drops in.' },
    { n: '6', c: '64748B', t: 'DEPARTED',  d: 'Security clicks "Departed". Full journey — times, photos, users, durations — is saved permanently.' },
  ]

  const colW = 2.0, rowH = 2.6, startX = 0.5, startY = 1.3
  stages.forEach((st, i) => {
    const x = startX + i * (colW + 0.08)
    // Arrow connector
    if (i > 0) {
      s.addShape('rightTriangle', {
        x: x - 0.1, y: startY + rowH / 2 - 0.1, w: 0.2, h: 0.2,
        fill: { color: THEME.gray }, line: { color: THEME.gray },
      })
    }
    // Card
    s.addShape('roundRect', {
      x, y: startY, w: colW, h: rowH,
      fill: { color: THEME.white }, line: { color: st.c, width: 2 }, rectRadius: 0.15,
    })
    s.addShape('ellipse', {
      x: x + colW / 2 - 0.35, y: startY + 0.15, w: 0.7, h: 0.7,
      fill: { color: st.c }, line: { color: st.c },
    })
    s.addText(st.n, {
      x: x + colW / 2 - 0.35, y: startY + 0.2, w: 0.7, h: 0.6,
      fontSize: 24, bold: true, color: THEME.white, align: 'center', valign: 'middle',
    })
    s.addText(st.t, {
      x: x + 0.1, y: startY + 0.95, w: colW - 0.2, h: 0.35,
      fontSize: 14, bold: true, color: st.c, align: 'center',
    })
    s.addText(st.d, {
      x: x + 0.15, y: startY + 1.35, w: colW - 0.3, h: rowH - 1.45,
      fontSize: 10, color: THEME.slateLt, valign: 'top',
    })
  })

  s.addText('⏱  Every stage has a timestamp. Dashboards show live elapsed time. Disputes become a matter of checking the app.', {
    x: 0.5, y: 4.4, w: 12.3, h: 0.5,
    fontFace: 'Calibri', fontSize: 14, italic: true, color: THEME.slateLt, align: 'center',
  })

  // Bottom strip — what each stage emits
  s.addShape('roundRect', { x: 0.5, y: 5.1, w: 12.3, h: 1.8,
    fill: { color: THEME.indigoLt }, line: { color: THEME.indigo }, rectRadius: 0.15 })
  s.addText('Data captured at each stage', {
    x: 0.8, y: 5.2, w: 12, h: 0.35, bold: true, fontSize: 14, color: THEME.indigo,
  })
  const capture = [
    '📸  Photos: plate, seal, gate, stacking',
    '⏱️   Timestamps: arrival, assign, gate-open, offload, depart',
    '👤  Users: who registered, who opened gate, who closed',
    '🏭  Dock + supervisor linkage for every shipment',
    '📦  Shipment, driver name, driver mobile, vehicle no (with plate history on swaps)',
    '🚫  Rejection reason + photo + OM decision trail',
  ]
  const capW = 5.9, capRows = 3
  capture.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2)
    s.addText(c, {
      x: 0.8 + col * (capW + 0.15), y: 5.55 + row * 0.4, w: capW, h: 0.35,
      fontSize: 11, color: THEME.slate,
    })
  })
}

// ── Slide 5 — Live demo script ───────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Live demo — what we will show', 'A 5-minute walkthrough across all four roles')

  const steps = [
    { role: 'Security',          color: THEME.sky,    bg: THEME.skyLt,    items: ['Scan shipment QR', 'Pick Inbound or Outbound', 'Click vehicle photo + driver info', 'Hit Register → watch the auto-assigned dock appear'] },
    { role: 'Dock Supervisor',   color: THEME.green,  bg: THEME.greenLt,  items: ['Card appears on dock screen instantly (socket.io)', 'Capture seal photo, open the gate', 'Watch live timer tick up', 'Mark offloaded with stacking photo'] },
    { role: 'Operation Manager', color: THEME.purple, bg: THEME.purpleLt, items: ['Live dock scorecards turn from green → orange → red → green', 'Approve or deny a rejection (with OM comment)', 'View performance: top dock, top supervisor, avg unload', 'Export day-wise Excel for auditors'] },
    { role: 'Admin',             color: THEME.amber,  bg: THEME.amberLt,  items: ['Add docks via Excel import', 'Create supervisors, assign them to docks', 'View full vehicle history log with photos', 'Pre-load data before going live'] },
  ]

  const cardW = 6.05, cardH = 2.6
  steps.forEach((st, i) => {
    const col = i % 2, row = Math.floor(i / 2)
    const x = 0.5 + col * (cardW + 0.2)
    const y = 1.15 + row * (cardH + 0.2)
    s.addShape('roundRect', {
      x, y, w: cardW, h: cardH,
      fill: { color: st.bg }, line: { color: st.color, width: 1 }, rectRadius: 0.15,
    })
    s.addShape('roundRect', {
      x, y, w: cardW, h: 0.5,
      fill: { color: st.color }, line: { color: st.color }, rectRadius: 0.15,
    })
    s.addText(st.role, {
      x: x + 0.25, y: y + 0.05, w: cardW - 0.4, h: 0.4,
      fontSize: 16, bold: true, color: THEME.white, valign: 'middle',
    })
    const text = st.items.map(item => ({
      text: item, options: { bullet: { code: '25B8' }, paraSpaceAfter: 4, fontSize: 12, color: THEME.slate },
    }))
    s.addText(text, {
      x: x + 0.3, y: y + 0.65, w: cardW - 0.5, h: cardH - 0.7,
      fontFace: 'Calibri', valign: 'top',
    })
  })
}

// ── Slide 6 — Rejection workflow ─────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Rejection workflow — the real game-changer', 'Handles bad trucks the way warehouses actually work — with photo proof and OM sign-off')

  // Two flows side by side
  const col1X = 0.5, col2X = 6.9, colW = 5.9

  // Inbound panel
  s.addShape('roundRect', { x: col1X, y: 1.1, w: colW, h: 5.9,
    fill: { color: THEME.skyLt }, line: { color: THEME.sky, width: 1 }, rectRadius: 0.15 })
  s.addText('📥 INBOUND (Unloading)', {
    x: col1X + 0.3, y: 1.2, w: colW - 0.6, h: 0.5,
    fontSize: 18, bold: true, color: THEME.sky,
  })
  s.addText('Damaged seal · Wrong shipment · Quality issue', {
    x: col1X + 0.3, y: 1.7, w: colW - 0.6, h: 0.3,
    fontSize: 12, italic: true, color: THEME.slateLt,
  })
  const inbound = [
    { t: 'Supervisor raises rejection', d: 'Captures reason + photo. Dock freed instantly. Queue drains next vehicle.' },
    { t: 'OM reviews', d: 'Approves (rectification needed) OR denies (back to queue).' },
    { t: 'Rectification on-site', d: 'Driver fixes the issue. Vehicle waits in "Rejected — On Hold".' },
    { t: 'OM resolves', d: 'Vehicle goes back to queue and gets reassigned automatically.' },
    { t: 'Unload continues', d: 'Normal flow resumes. Full audit trail preserved.' },
  ]
  inbound.forEach((st, i) => {
    const y = 2.15 + i * 0.9
    s.addShape('ellipse', { x: col1X + 0.35, y, w: 0.45, h: 0.45,
      fill: { color: THEME.sky }, line: { color: THEME.sky } })
    s.addText(String(i + 1), { x: col1X + 0.35, y, w: 0.45, h: 0.45,
      fontSize: 16, bold: true, color: THEME.white, align: 'center', valign: 'middle' })
    s.addText(st.t, { x: col1X + 1.0, y: y - 0.02, w: colW - 1.2, h: 0.35,
      fontSize: 13, bold: true, color: THEME.slate })
    s.addText(st.d, { x: col1X + 1.0, y: y + 0.3, w: colW - 1.2, h: 0.5,
      fontSize: 10.5, color: THEME.slateLt })
  })

  // Outbound panel
  s.addShape('roundRect', { x: col2X, y: 1.1, w: colW, h: 5.9,
    fill: { color: THEME.amberLt }, line: { color: THEME.amber, width: 1 }, rectRadius: 0.15 })
  s.addText('📤 OUTBOUND (Loading)', {
    x: col2X + 0.3, y: 1.2, w: colW - 0.6, h: 0.5,
    fontSize: 18, bold: true, color: THEME.amber,
  })
  s.addText('Driver drunk · Wrong vehicle · Truck not clean', {
    x: col2X + 0.3, y: 1.7, w: colW - 0.6, h: 0.3,
    fontSize: 12, italic: true, color: THEME.slateLt,
  })
  const outbound = [
    { t: 'Supervisor raises rejection', d: 'Reason + photo. Dock freed. Vehicle marked "on hold".' },
    { t: 'OM approves the rejection', d: 'Transporter is notified to send a replacement vehicle.' },
    { t: 'Replacement arrives at gate', d: 'Security enters the SAME shipment → system auto-swaps vehicle details.' },
    { t: 'Old vehicle departs "Rejected"', d: 'Security closes the old record separately. No extra vehicle stuck on-site.' },
    { t: 'New vehicle loads normally', d: 'Shipment history shows both plates and the swap reason.' },
  ]
  outbound.forEach((st, i) => {
    const y = 2.15 + i * 0.9
    s.addShape('ellipse', { x: col2X + 0.35, y, w: 0.45, h: 0.45,
      fill: { color: THEME.amber }, line: { color: THEME.amber } })
    s.addText(String(i + 1), { x: col2X + 0.35, y, w: 0.45, h: 0.45,
      fontSize: 16, bold: true, color: THEME.white, align: 'center', valign: 'middle' })
    s.addText(st.t, { x: col2X + 1.0, y: y - 0.02, w: colW - 1.2, h: 0.35,
      fontSize: 13, bold: true, color: THEME.slate })
    s.addText(st.d, { x: col2X + 1.0, y: y + 0.3, w: colW - 1.2, h: 0.5,
      fontSize: 10.5, color: THEME.slateLt })
  })
}

// ── Slide 7 — Use cases we handle ────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Use cases already handled', 'Real-world scenarios built into the system')

  const cases = [
    { e: '🔀', t: 'Vehicle swap on same shipment', b: 'When an outbound truck is rejected, the next truck coming for the same shipment is auto-linked — no data entry from scratch.' },
    { e: '🚫', t: 'Dock type mismatch',            b: 'Inbound vehicle cannot be assigned to an outbound dock and vice-versa. System enforces this on manual override too.' },
    { e: '👤', t: 'Supervisor hand-off mid-shift',  b: 'OM can reassign a dock to a new supervisor — except when the dock is actively in progress (gate open).' },
    { e: '🏭', t: 'Dock deactivation safely',       b: 'Cannot deactivate a dock with a vehicle on it. Blocked with a clear error message.' },
    { e: '📲', t: 'Multi-language WhatsApp',        b: '9 Indian languages (English, Hindi, Marathi, Gujarati, Tamil, Telugu, Kannada, Punjabi, Bengali). Last-used language is remembered.' },
    { e: '⏱️',  t: 'Live timers',                    b: 'Dock card shows elapsed time since assignment / since gate open — visible to OM at a glance.' },
    { e: '📥', t: 'Excel bulk import / export',    b: 'Download sample, fill docks or users in bulk, upload back. Daily vehicle log exports to Excel for auditors.' },
    { e: '🔌', t: 'Offline-friendly disconnect',    b: 'If the server briefly disconnects, the UI shows a visual "truck broke down" overlay. When it reconnects, work resumes.' },
    { e: '👁️',  t: 'Clean UI for ground staff',      b: 'Security + Dock screens show only what they need. OM + Admin get the dense data-rich view. No training for operators.' },
  ]

  const cardW = 4.1, cardH = 1.75
  cases.forEach((c, i) => {
    const col = i % 3, row = Math.floor(i / 3)
    const x = 0.5 + col * (cardW + 0.2)
    const y = 1.15 + row * (cardH + 0.2)
    featureCard(s, x, y, cardW, cardH, c.e, c.t, c.b, THEME.grayBg)
  })
}

// ── Slide 8 — Why it wins (Pros) ─────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Why this wins — value to the warehouse', 'Concrete benefits for operations, compliance, and management')

  const pros = [
    { e: '⚡',  t: 'Instant visibility',        b: 'Live dock status on every manager\'s screen. No more "what\'s happening at gate 3?" calls.' },
    { e: '⏱️',  t: 'Faster turnaround',         b: 'Auto-dock assignment removes the human bottleneck. Queue drains the moment a dock goes green.' },
    { e: '🔒', t: 'Accountability & audit',    b: 'Every action is logged with user, timestamp, photo. Disputes with transporters end in seconds, not days.' },
    { e: '📊', t: 'Data-driven improvement',   b: 'Avg unload time, rejection %, top-performing docks / supervisors — KPIs finally become measurable.' },
    { e: '🌐', t: 'Zero cloud dependency',     b: 'Runs on your own LAN. No SaaS fees. No internet outage downtime. Data stays inside your warehouse.' },
    { e: '📱', t: 'Works on any device',       b: 'Phones at the gate, tablets on dock, desktops in the OM cabin. Responsive UI, no app install.' },
    { e: '💸', t: 'Low cost to deploy',        b: 'Single Windows machine + browsers. No licensing. One-time internal effort, no recurring bills.' },
    { e: '🛠️',  t: 'Extensible & owned',         b: 'Source code stays with us. New roles, new photo types, new KPIs can be added without vendor lock-in.' },
  ]

  const cardW = 6.1, cardH = 1.3
  pros.forEach((p, i) => {
    const col = i % 2, row = Math.floor(i / 2)
    const x = 0.5 + col * (cardW + 0.15)
    const y = 1.15 + row * (cardH + 0.12)
    s.addShape('roundRect', {
      x, y, w: cardW, h: cardH,
      fill: { color: THEME.white }, line: { color: THEME.indigo, width: 1 }, rectRadius: 0.1,
    })
    s.addText(p.e, { x: x + 0.15, y: y + 0.2, w: 0.7, h: 0.9, fontSize: 28, align: 'center' })
    s.addText(p.t, {
      x: x + 0.9, y: y + 0.12, w: cardW - 1.05, h: 0.4,
      fontSize: 14, bold: true, color: THEME.indigo,
    })
    s.addText(p.b, {
      x: x + 0.9, y: y + 0.5, w: cardW - 1.05, h: cardH - 0.55,
      fontSize: 11, color: THEME.slate, valign: 'top',
    })
  })
}

// ── Slide 9 — Numbers we measure ─────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Numbers senior management can expect', 'What will be measurable from day one')

  bigStat(s, 0.5,  1.3, 3.0, 1.7, '−40%', 'Avg vehicle wait time',      THEME.green)
  bigStat(s, 3.7,  1.3, 3.0, 1.7, '100%', 'Shipments with audit trail', THEME.indigo)
  bigStat(s, 6.9,  1.3, 3.0, 1.7, '0',    'Paper registers required',   THEME.amber)
  bigStat(s, 10.1, 1.3, 2.8, 1.7, '4',    'Roles, 1 app, live sync',    THEME.purple)

  bigStat(s, 0.5,  3.3, 3.0, 1.7, '9',    'Languages for WhatsApp',      THEME.sky)
  bigStat(s, 3.7,  3.3, 3.0, 1.7, '24/7', 'Local-network operation',      THEME.red)
  bigStat(s, 6.9,  3.3, 3.0, 1.7, 'Excel',  'Bulk import & daily exports', THEME.green)
  bigStat(s, 10.1, 3.3, 2.8, 1.7, 'LAN',   'No cloud, no SaaS fees',       THEME.slate)

  s.addShape('roundRect', { x: 0.5, y: 5.3, w: 12.4, h: 1.6,
    fill: { color: THEME.indigoLt }, line: { color: THEME.indigo }, rectRadius: 0.15 })
  s.addText('📈  Reports straight out of the app', {
    x: 0.8, y: 5.4, w: 12, h: 0.4, bold: true, fontSize: 15, color: THEME.indigo,
  })
  const reports = [
    '• Average time on site (per day / week / month)',
    '• Top-performing dock and top-performing supervisor',
    '• Rejections raised, approved, denied, resolved (by cause)',
    '• Vehicles processed per dock type (inbound vs outbound)',
    '• Daily exports to Excel for finance & transporter audits',
    '• Live "on-site" census — how many trucks are in the campus right now',
  ]
  reports.forEach((r, i) => {
    const col = i % 2, row = Math.floor(i / 2)
    s.addText(r, {
      x: 0.85 + col * 6.0, y: 5.8 + row * 0.35, w: 6.0, h: 0.35,
      fontSize: 12, color: THEME.slate,
    })
  })
}

// ── Slide 10 — Tech stack & footprint ────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Architecture & footprint', 'What it takes to run this in our warehouse')

  // Left: architecture diagram
  const diagX = 0.5, diagY = 1.15, diagW = 6.5, diagH = 5.7
  s.addShape('roundRect', { x: diagX, y: diagY, w: diagW, h: diagH,
    fill: { color: THEME.grayBg }, line: { color: THEME.gray }, rectRadius: 0.15 })
  s.addText('Deployment diagram', {
    x: diagX + 0.25, y: diagY + 0.15, w: diagW - 0.5, h: 0.35,
    fontSize: 14, bold: true, color: THEME.indigo,
  })

  // Server box
  s.addShape('roundRect', { x: diagX + 2.1, y: diagY + 0.75, w: 2.3, h: 0.85,
    fill: { color: THEME.indigo }, line: { color: THEME.indigo }, rectRadius: 0.1 })
  s.addText('🖥  Warehouse Server\n(Node.js + SQLite)', {
    x: diagX + 2.1, y: diagY + 0.75, w: 2.3, h: 0.85,
    fontSize: 11, bold: true, color: THEME.white, align: 'center', valign: 'middle',
  })

  // Clients
  const clients = [
    { e: '📱', t: 'Security\nPhone/Tablet', x: diagX + 0.3 },
    { e: '📱', t: 'Dock Supervisor\nTablet at each dock', x: diagX + 1.9 },
    { e: '💻', t: 'Ops Manager\nDesktop/Laptop', x: diagX + 3.5 },
    { e: '💻', t: 'Admin\nDesktop', x: diagX + 5.1 },
  ]
  clients.forEach(c => {
    s.addShape('roundRect', { x: c.x, y: diagY + 2.5, w: 1.4, h: 1.0,
      fill: { color: THEME.white }, line: { color: THEME.indigo }, rectRadius: 0.1 })
    s.addText(c.e, { x: c.x, y: diagY + 2.55, w: 1.4, h: 0.4, fontSize: 18, align: 'center' })
    s.addText(c.t, { x: c.x + 0.05, y: diagY + 2.95, w: 1.3, h: 0.55, fontSize: 9, color: THEME.slate, align: 'center' })

    // Line to server
    s.addShape('line', {
      x: c.x + 0.7, y: diagY + 2.5, w: (diagX + 3.25) - (c.x + 0.7), h: -0.9,
      line: { color: THEME.indigoLt, width: 2 },
    })
  })

  // LAN label
  s.addText('⟵  connected via warehouse LAN / Wi-Fi  ⟶', {
    x: diagX + 0.3, y: diagY + 3.7, w: diagW - 0.6, h: 0.35,
    fontSize: 11, italic: true, color: THEME.slateLt, align: 'center',
  })

  // Tech bullets
  s.addText('Tech choices', {
    x: diagX + 0.3, y: diagY + 4.2, w: diagW - 0.6, h: 0.35,
    fontSize: 12, bold: true, color: THEME.indigo,
  })
  bulletList(s, diagX + 0.3, diagY + 4.5, diagW - 0.6, 1.1, [
    'Server: Node.js + SQLite + socket.io (single process, single file DB)',
    'Client: React + Vite + Tailwind (served by the same server)',
    'Auth: JWT with auto-persisted secret · bcrypt password hashing',
    'Realtime: socket.io pushes updates to all dashboards on every state change',
  ], { fontSize: 10.5 })

  // Right: footprint stats
  const rx = 7.2
  s.addShape('roundRect', { x: rx, y: 1.15, w: 5.7, h: 2.8,
    fill: { color: THEME.indigoLt }, line: { color: THEME.indigo }, rectRadius: 0.15 })
  s.addText('Footprint', {
    x: rx + 0.25, y: 1.25, w: 5.2, h: 0.35, fontSize: 14, bold: true, color: THEME.indigo,
  })
  bulletList(s, rx + 0.3, 1.65, 5.2, 2.25, [
    'One Windows / Linux server (2 CPU, 4 GB RAM is plenty)',
    'SQLite file — full backup = copying one file',
    'Uploads folder — photos stored locally, served back via HTTPS',
    'Any browser → no install, no app-store, no device-specific build',
    'Logs folder — every API call + decision kept for compliance',
  ], { fontSize: 12 })

  s.addShape('roundRect', { x: rx, y: 4.1, w: 5.7, h: 2.8,
    fill: { color: THEME.greenLt }, line: { color: THEME.green }, rectRadius: 0.15 })
  s.addText('Security posture', {
    x: rx + 0.25, y: 4.2, w: 5.2, h: 0.35, fontSize: 14, bold: true, color: THEME.green,
  })
  bulletList(s, rx + 0.3, 4.6, 5.2, 2.3, [
    'JWT tokens — 401 interceptor auto-logs out on expiry',
    'Rate-limited login endpoint — blocks brute-force attempts',
    'Role-based access control — every action is scoped',
    'Server-side validation + global error handler (no raw stack traces to users)',
    'All photos + logs stay on-premise. Nothing leaves the warehouse LAN.',
  ], { fontSize: 12 })
}

// ── Slide 11 — Roll-out plan ─────────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Proposed roll-out plan', 'Low-risk phased deployment with a clear owner for each step')

  const phases = [
    { w: 'Week 1', t: 'Pilot — 1 gate, 2 docks', d: 'Deploy to one machine, enroll security + 2 supervisors, shadow-run alongside paper register.' },
    { w: 'Week 2', t: 'Operator feedback',     d: 'Collect friction points, fix UI / label tweaks, re-train if needed. Add remaining docks.' },
    { w: 'Week 3', t: 'Go live fully',         d: 'Paper register retired. Full gate + all docks + OM live. Daily Excel export for finance.' },
    { w: 'Week 4', t: 'Optimise & measure',    d: 'Read performance stats, tune dock assignments, set KPIs for supervisors & OM.' },
    { w: 'Month 2+', t: 'Iterate',             d: 'Add new fields, new reports, new roles based on what senior management asks for.' },
  ]

  phases.forEach((p, i) => {
    const y = 1.25 + i * 1.05
    s.addShape('roundRect', { x: 0.5, y, w: 1.5, h: 0.9,
      fill: { color: THEME.indigo }, line: { color: THEME.indigo }, rectRadius: 0.1 })
    s.addText(p.w, { x: 0.5, y, w: 1.5, h: 0.9,
      fontSize: 15, bold: true, color: THEME.white, align: 'center', valign: 'middle' })

    s.addShape('roundRect', { x: 2.15, y, w: 10.7, h: 0.9,
      fill: { color: THEME.grayBg }, line: { color: THEME.gray }, rectRadius: 0.1 })
    s.addText(p.t, { x: 2.35, y: y + 0.1, w: 10.3, h: 0.35,
      fontSize: 14, bold: true, color: THEME.slate })
    s.addText(p.d, { x: 2.35, y: y + 0.45, w: 10.3, h: 0.4,
      fontSize: 11, color: THEME.slateLt })
  })

  s.addShape('roundRect', { x: 0.5, y: 6.6, w: 12.4, h: 0.55,
    fill: { color: THEME.amberLt }, line: { color: THEME.amber }, rectRadius: 0.1 })
  s.addText('Zero-risk rollback: shut the server down and the warehouse reverts to its old paper flow. No vendor lock-in.', {
    x: 0.7, y: 6.6, w: 12.1, h: 0.55,
    fontSize: 12, bold: true, italic: true, color: THEME.amber, valign: 'middle',
  })
}

// ── Slide 12 — Ask ───────────────────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  titleBar(s, 'Our ask', 'What we need from senior management to move forward')

  const asks = [
    { e: '✅', t: 'Green light for pilot', b: 'Approval to run the 1-gate / 2-dock pilot for 2 weeks.' },
    { e: '💻', t: 'One server allocation',  b: 'A basic machine on the warehouse LAN — existing hardware is fine.' },
    { e: '👥', t: 'Operator time for 2 hrs', b: 'Security + 2 supervisors for a short training and shadow run.' },
    { e: '📣', t: 'OM sponsorship',         b: 'Endorsement from Operations so ground staff adopt the app with confidence.' },
  ]

  const cardW = 6.05, cardH = 1.9
  asks.forEach((a, i) => {
    const col = i % 2, row = Math.floor(i / 2)
    const x = 0.5 + col * (cardW + 0.2)
    const y = 1.2 + row * (cardH + 0.2)
    s.addShape('roundRect', {
      x, y, w: cardW, h: cardH,
      fill: { color: THEME.white }, line: { color: THEME.indigo, width: 2 }, rectRadius: 0.15,
    })
    s.addText(a.e, { x: x + 0.2, y: y + 0.35, w: 1.2, h: 1.2, fontSize: 48, align: 'center' })
    s.addText(a.t, {
      x: x + 1.5, y: y + 0.3, w: cardW - 1.7, h: 0.5,
      fontSize: 18, bold: true, color: THEME.indigo,
    })
    s.addText(a.b, {
      x: x + 1.5, y: y + 0.85, w: cardW - 1.7, h: cardH - 0.95,
      fontSize: 13, color: THEME.slate, valign: 'top',
    })
  })

  s.addShape('roundRect', { x: 0.5, y: 5.45, w: 12.4, h: 1.6,
    fill: { color: THEME.indigo }, line: { color: THEME.indigo }, rectRadius: 0.15 })
  s.addText('We have already built it. We have already tested it.\nAll we need is the go-ahead to plug it in.', {
    x: 0.7, y: 5.55, w: 12.1, h: 1.4,
    fontSize: 20, bold: true, color: THEME.white, align: 'center', valign: 'middle',
  })
}

// ── Slide 13 — Thank you ─────────────────────────────────────────────────────
{
  const s = pptx.addSlide({ masterName: 'MAIN' })
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 7.5, fill: { color: THEME.indigo } })
  s.addText('Thank you', {
    x: 0.5, y: 2.5, w: 12.3, h: 1.5,
    fontFace: 'Calibri', fontSize: 90, bold: true, color: THEME.white, align: 'center',
  })
  s.addText('Questions → live demo next', {
    x: 0.5, y: 4.1, w: 12.3, h: 0.7,
    fontFace: 'Calibri', fontSize: 26, color: 'C7D2FE', align: 'center',
  })
  s.addText('Vehicle FC Manager — built in-house, owned in-house.', {
    x: 0.5, y: 5.0, w: 12.3, h: 0.5,
    fontFace: 'Calibri', fontSize: 16, italic: true, color: 'A5B4FC', align: 'center',
  })
}

// ── Save ─────────────────────────────────────────────────────────────────────
const outFile = path.join(__dirname, 'Vehicle_FC_Manager_Pitch.pptx')
pptx.writeFile({ fileName: outFile }).then(() => {
  const stat = fs.statSync(outFile)
  console.log(`✓ Wrote ${outFile}  (${(stat.size / 1024).toFixed(1)} KB)`)
})
