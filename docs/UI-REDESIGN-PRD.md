# LenzPay UI Redesign — Product Requirements Document

**Status:** Draft for design kickoff  
**Audience:** Product design, UX research, product, engineering, compliance  
**Platforms:** iOS and Android mobile apps  
**Primary design constraint:** Retain LenzPay mint `#34FEA0` as the primary brand color  
**Last updated:** 7 September 2026

## 1. Executive summary

LenzPay is a payment vault that lets a customer pay in Nigerian naira using money held across multiple sources: Nigerian bank accounts, mobile wallets, USD accounts, cards, and crypto wallets. LenzPay can choose the best source automatically or split a payment across sources when one balance is insufficient. The product also includes transaction history, rewards, security controls, and a separate merchant experience for accepting QR payments and managing settlement.

This project will redesign the mobile UI without changing the underlying product logic. The redesign should make a complex multi-source payment product feel simple, trustworthy, fast, and distinctly LenzPay. It must improve hierarchy, comprehension, consistency, accessibility, and cross-platform behavior while preserving the existing primary mint.

The most important design outcome is confidence: before confirming a payment, a customer should understand who is being paid, how much will be paid, which source or sources will fund it, what conversion or transaction costs apply, and what happens next.

## 2. Product context

### 2.1 Core proposition

**One payment identity across all of a user's money.**

LenzPay enables customers to:

- connect multiple financial sources;
- see their combined NGN-equivalent spending capacity;
- scan a merchant QR or enter bank/Lenz Tag details;
- let LenzPay automatically select a funding source;
- manually choose a source when desired;
- split a payment across eligible sources when necessary;
- review fees, FX, and funding details before authorization;
- authorize securely with PIN or biometrics;
- earn and redeem rewards;
- inspect and control security, limits, devices, and alerts.

LenzPay enables merchants to:

- complete business onboarding and verification;
- configure a settlement account;
- generate and share payment QR codes;
- monitor payments, revenue, analytics, and settlements;
- control accepted currencies and business settings.

### 2.2 Target users

#### Consumer

A digitally active Nigerian customer who keeps money across banks, wallets, foreign-currency accounts, or crypto and wants a single, reliable way to pay locally. The customer may have uneven balances, may be sensitive to hidden fees, and needs strong reassurance about security and payment status.

#### Merchant

A Nigerian small-business owner or operator who wants to accept QR payments, confirm payment quickly, understand daily revenue, and know when funds will settle.

### 2.3 User needs

- “Help me pay without moving money between accounts first.”
- “Show me exactly where the money will come from.”
- “Do not surprise me with fees or exchange rates.”
- “Tell me clearly whether the payment succeeded, failed, or is still processing.”
- “Give me control when automatic selection is not what I want.”
- “Make security visible without making every task feel alarming.”
- “For merchants, make payment confirmation and settlement status unmistakable.”

## 3. Problem statement

The current app contains the necessary product capabilities, but its large screen set and dense financial information need a more unified experience. The redesign must address:

- inconsistent visual hierarchy across onboarding, payment, account, reward, and merchant screens;
- the cognitive load of explaining automatic and split funding;
- insufficient distinction between balance, spendable balance, source currency, and NGN equivalent;
- the risk of users missing fees, FX rates, pending collection, or failure details;
- inconsistent empty, loading, disabled, error, success, and pending states;
- five-item tab structures that may compete with the primary payment action;
- the need for consistent patterns across iOS and Android, including edge-to-edge layouts and safe areas;
- a brand inconsistency between the product’s primary mint and the current app icon lime.

## 4. Goals and success criteria

### 4.1 Goals

1. Make the path from intent to completed payment obvious and fast.
2. Make automatic and split funding understandable at a glance.
3. Increase confidence through transparent fees, FX, source, status, and security information.
4. Create one scalable design system for consumer and merchant experiences.
5. Preserve LenzPay’s recognizable mint while improving the supporting palette and hierarchy.
6. Deliver accessible, implementation-ready designs for both iOS and Android.

### 4.2 Product metrics

Baseline values should be captured before release. The redesign should target:

- increased completion rate from payment initiation to successful payment;
- reduced abandonment on source selection and payment confirmation;
- reduced median time from QR recognition to payment authorization;
- fewer retries caused by unclear validation or failure recovery;
- increased successful source connections;
- increased comprehension of split funding in usability testing;
- no regression in merchant QR creation and settlement-task completion;
- accessibility audit pass for all critical flows.

### 4.3 Usability targets

In moderated testing, at least 4 of 5 representative users should be able to:

- identify the total payment amount and payee without prompting;
- explain which account or accounts will fund the payment;
- identify any fee or FX cost before confirming;
- distinguish completed, pending, and failed payment states;
- recover from an insufficient-balance or declined-source scenario;
- add a new source and understand whether it is ready to use.

## 5. Non-goals

This redesign does not authorize changes to:

- payment orchestration, source-ranking, split-allocation, FX, rewards, fraud, or settlement logic;
- regulatory or KYC requirements;
- backend contracts or provider capabilities;
- supported source types, currencies, or payment rails;
- consumer-to-merchant and merchant settlement business rules;
- the primary brand color.

Designers may recommend product changes, but those recommendations must be separated from the implementation-ready redesign and reviewed by product and engineering.

## 6. Brand and visual direction

### 6.1 Non-negotiable brand color

The primary color remains:

- **Primary mint:** `#34FEA0`
- **Primary gradient endpoint:** `#0CEF93`
- **Text/icon on mint:** `#005C36`

Use mint for primary actions, active navigation, selected states, progress, focus, and moments of positive brand emphasis. It should not fill every surface or compete with semantic status colors.

The current app icon uses `#B5E61D`, a yellow-lime that does not match the product. The redesign should update the icon and related brand assets to the primary mint rather than change the interface to match the icon.

### 6.2 Existing foundation

The current product is dark-first and uses:

- background: `#0E0E0F`;
- layered surfaces from `#131314` to `#2C2C2D`;
- Space Grotesk for display text and financial figures;
- Inter for body text, labels, and controls;
- purple for crypto/reward accents;
- green, amber, and red for success, pending, and failure;
- blue, orange, teal, and purple-blue as asset identifiers.

Designers may refine the supporting neutrals, typography scale, spacing, radius, elevation, illustration style, and motion language. Any proposed light theme is an optional exploration and is not required for the initial handoff.

### 6.3 Desired personality

- confident, not loud;
- premium, not ornamental;
- modern African fintech, not generic crypto trading;
- transparent, not mysterious;
- calm under failure;
- precise with money and status.

### 6.4 Color requirements

- Semantic colors must never rely on color alone; pair them with labels and icons.
- Confirm text and icon contrast in every state, especially text placed on mint.
- Treat crypto/asset colors as identifiers, not primary action colors.
- Specify pressed, focused, disabled, loading, selected, and destructive variants.
- Avoid mint for failed, destructive, or warning actions.

## 7. Experience principles

1. **Money first.** Amount, currency, payee, source, and status receive the strongest hierarchy.
2. **Progressive disclosure.** Show the decision users need now; make detailed funding legs, rates, and guarantees available without overwhelming the primary task.
3. **Automation with an explanation.** “Auto” must always show what LenzPay selected and why, with a clear route to manual control.
4. **No financial ambiguity.** Distinguish available/spendable balance from ledger balance, native currency from NGN equivalent, and estimated values from final values.
5. **One obvious primary action.** Each screen should have a single dominant next step.
6. **Status is a system.** Loading, preparing, processing, pending, successful, partially collected, failed, and blocked states must look related but unmistakably different.
7. **Recovery over blame.** Error screens should explain what happened in plain language and offer the most useful next action.
8. **Secure by design.** Make verification and protection visible at decision points without adding unnecessary friction.

## 8. Information architecture

### 8.1 Consumer areas

The existing consumer navigation contains Home, Scan, History, Rewards, and Security, with Sources, Notifications, and Profile as linked destinations.

Design should test whether all five current tabs deserve equal weight. The payment action must remain the dominant destination. At minimum, provide a recommended navigation model and one rationale-backed alternative.

Required consumer destinations:

- Home/dashboard
- Pay: scan QR and enter account/Lenz Tag
- Payment history and transaction detail
- Sources and source detail
- Rewards, tiers, and redemption
- Security center, limits, devices, PIN, and alerts
- Notifications
- Profile, settings, FX rates, and support

### 8.2 Merchant areas

The existing merchant navigation contains Home, Payments, Analytics, Settlement, and QR, with Settings and Onboarding as linked destinations.

Required merchant destinations:

- Merchant home/dashboard
- Payment list and payment detail
- Analytics
- Settlement status and history
- Create/display/share QR
- Business settings
- Merchant onboarding and KYC

### 8.3 Role handling

Consumer and merchant modes must be visually related but clearly distinguishable. Designs must define how a user knows which mode is active and how role switching works if it is exposed in the product.

## 9. Priority journeys

### P0 — Must be designed first

#### A. Consumer onboarding and account setup

Welcome → create/sign in → OTP → create PIN → KYC → KYC pending → biometrics → consumer home.

Requirements:

- communicate the multi-source proposition in plain language;
- keep data-entry progress clear;
- show inline validation and preserve entered data when possible;
- explain why BVN, identity documents, camera access, and biometrics are requested;
- support keyboard, camera, permission-denied, retry, and pending-review states;
- do not imply that optional biometrics are mandatory.

#### B. Scan-to-pay

Scan QR → recognize merchant → enter/confirm amount → choose automatic/manual/split funding → review → PIN/biometric authorization → processing → success, pending, or failure.

Requirements:

- offer manual payment entry when camera access is unavailable;
- show merchant verification and identity clearly;
- support merchant-provided and customer-entered amounts;
- keep amount and payee visible throughout the flow;
- explain auto-selection and allow source changes;
- show split allocations as exact amounts per source;
- disclose fees, FX rate, total debit, rewards, and settlement expectations before authorization;
- prevent accidental navigation away while payment is being authorized or processed;
- provide specific recovery actions for insufficient funds, source failure, expired quote, limit exceeded, fraud review, and network interruption;
- make the receipt shareable and transaction reference easy to copy.

#### C. Add and manage funding sources

Sources → choose source type → connect bank/card/wallet/USD/crypto → verify/link → source detail → set default/priority/reserve/remove.

Requirements:

- distinguish source type, institution, account mask, currency, native balance, NGN equivalent, and spendable amount;
- communicate connection method and security before requesting credentials;
- identify source availability, freshness, capability, and sync status;
- make default, priority, and reserve behavior understandable;
- disclose crypto conversion spread before connection and payment;
- require clear confirmation for source removal.

#### D. Merchant receives a payment

Merchant onboarding → settlement setup → QR generation/share → payment received → payment detail → settlement tracking.

Requirements:

- make QR legible and usable at distance;
- support open-amount and fixed-amount QR states;
- make business identity and payment amount visible near the QR;
- distinguish customer payment success from merchant settlement completion;
- show pending settlement amount and expected timing;
- provide unmistakable real-time confirmation for received payments.

### P1 — Complete before developer handoff

- Consumer home/dashboard
- Payment history, filtering, empty state, and transaction detail
- Rewards overview, tiers, progress, earning history, and redemption
- Security overview, transaction limits, trusted devices, PIN change, and fraud alerts
- Notifications
- Profile, settings, live FX rates, and support
- Merchant dashboard, payments, analytics, settlement, and settings

### P2 — Supporting states and polish

- skeletons and loading states;
- offline and degraded-connectivity behavior;
- permission education;
- zero-data and first-use states;
- long names, large balances, small screens, and dynamic type;
- reduced-motion variants;
- app icon, splash, notification icon, and shareable receipt presentation.

## 10. Screen-level requirements

### 10.1 Consumer home

Must prioritize:

1. total available NGN-equivalent balance;
2. primary Pay/Scan action;
3. linked sources and their status;
4. recent transactions;
5. rewards summary;
6. alerts requiring action.

Balance privacy/hide behavior should be explored. Avoid presenting an aggregate value without clarifying that it is an NGN equivalent and may include converted assets.

### 10.2 Source selection and Smart Split

For each source show institution/asset, account mask, spendable amount, currency, status, and relevant fee/FX implication. Automatic selection must have a visible recommendation rationale. Split funding must show a sum that reconciles exactly to the payment total.

### 10.3 Confirmation

The confirmation screen must show, above the authorization action:

- payee and verification state;
- amount the payee receives;
- total amount debited;
- source or source breakdown;
- fee and conversion cost;
- FX rate and quote-expiry treatment when applicable;
- reward estimate;
- authorization method.

No cost may first appear after authorization.

### 10.4 Payment status and receipt

Design distinct variants for:

- preparing funds;
- processing;
- completed;
- completed with collection pending;
- failed before payee settlement;
- blocked for security review;
- interrupted/unknown status.

The unknown-status state must tell users not to retry blindly and should direct them to check transaction history.

### 10.5 History and transaction detail

Transaction rows must expose direction, merchant/payee, amount, date, and status. Detail must show funding legs for split transactions, total fees, conversion details, pending collection, reference, and support/dispute entry points where applicable.

### 10.6 Rewards

Clearly separate points, naira value, cashback, current tier, next-tier progress, earning rates, and redemption methods. Do not present promotional value in a way that can be confused with withdrawable cash.

### 10.7 Security

The security center should give users a quick status overview and direct access to limits, devices, PIN, biometrics, and alerts. High-risk actions require explicit confirmation. Fraud alerts must prioritize payee, amount, time, reason, and “Was this you?” actions.

### 10.8 Merchant dashboard

Prioritize today’s received revenue, pending settlement, latest payments, and the Show/Create QR action. Analytics should support quick period comparison without resembling a speculative trading interface.

## 11. Component and design-system requirements

The Figma library must include documented variants for:

- color, typography, spacing, radius, elevation, and icon tokens;
- primary, secondary, tertiary, destructive, and icon buttons;
- text inputs, amount inputs, OTP, PIN pad, search, selectors, and validation;
- cards, source cards, transaction rows, balance blocks, and statistic blocks;
- tabs/navigation, headers, sheets, modals, dialogs, and toasts;
- badges, chips, segmented controls, toggles, sliders, and progress;
- QR scanner viewport and QR display;
- chart styles, legends, tooltips, empty charts, and error states;
- skeleton, spinner, success, pending, warning, failure, and offline states;
- receipt and funding-breakdown patterns.

Every interactive component must define default, pressed, focused, selected, disabled, loading, error, and success states where applicable.

## 12. Content design

- Use short, direct Nigerian English suitable for a broad financial-literacy range.
- Use “source” only after introducing it as an account or wallet used to fund payment.
- Prefer “Pay with” over internal orchestration terminology.
- Explain “Smart Split” the first time it appears.
- Never use “successful” if the final outcome is unknown.
- Pair error causes with a recovery action.
- Use consistent money formatting, currency codes, account masking, dates, and transaction references.
- Confirm whether the brand is written **LenzPay** or **Lenz Pay** and apply one convention consistently. The current interface uses both.

## 13. Accessibility and inclusive design

Designs must meet WCAG 2.2 AA where applicable and platform accessibility guidance.

- Minimum touch target: 44 × 44 pt on iOS and 48 × 48 dp on Android.
- Body text should remain readable at supported dynamic font sizes without clipping.
- Primary information must not rely on color, animation, gesture, or sound alone.
- Define logical screen-reader order and accessible names for icons and financial values.
- Provide visible focus states for keyboard/switch navigation.
- Respect reduced motion and avoid essential information in transient animation.
- Support small Android screens, safe areas, display cutouts, and edge-to-edge layouts.
- Avoid low-contrast muted text for disclosures, fees, errors, and disabled controls.
- Camera-based payment must have a non-camera alternative.

## 14. Motion and feedback

Motion should explain state changes rather than decorate them.

- Use subtle transitions when a source is selected or a split is calculated.
- Keep processing animation calm and pair it with text status.
- Use haptics for deliberate milestones such as successful scan, authorization, and payment completion.
- Do not use success motion until the payment state is confirmed.
- Provide reduced-motion alternatives for onboarding, charts, progress, and status animations.

## 15. Platform requirements

- Provide iOS and Android layouts or annotated differences where native behavior diverges.
- Account for Android edge-to-edge rendering and system bars.
- Specify keyboard behavior for forms and amount entry.
- Use native-feeling back behavior and prevent back navigation during irreversible payment steps.
- Design camera, biometric, settings, share-sheet, and permission transitions with platform conventions.
- Do not place essential actions inside unsafe or gesture-conflict areas.

## 16. Required states

Every applicable screen must include:

- first use/empty;
- populated;
- loading/skeleton;
- refreshing;
- inline validation;
- disabled;
- permission denied;
- offline;
- recoverable error;
- non-recoverable or blocked state;
- success;
- pending/unknown status;
- long-content and large-text stress case.

Financial screens additionally require stale balance/rate, expired quote, insufficient spendable balance, source unavailable, limit exceeded, partial/split funding, and pending collection states.

## 17. Design deliverables

1. Current-experience audit with usability and consistency findings.
2. Sitemap and revised consumer/merchant navigation recommendation.
3. End-to-end user-flow diagrams for all P0 journeys.
4. Low-fidelity wireframes covering P0 flows and major edge cases.
5. High-fidelity iOS and Android designs.
6. Clickable prototypes for consumer payment and merchant payment receipt.
7. Tokenized Figma design system with component variants.
8. Content/copy sheet covering labels, validation, errors, status, and disclosures.
9. Accessibility annotations and contrast report.
10. Motion specifications, including reduced-motion behavior.
11. Developer handoff with measurements, tokens, component behavior, asset exports, and state logic.
12. Updated app icon and launch assets using the retained primary mint.

## 18. Handoff acceptance criteria

The redesign is ready for implementation when:

- all P0 and P1 screens and required states are represented;
- the primary mint remains `#34FEA0` and its usage is documented;
- all costs and source allocations appear before payment authorization;
- automatic and split payment concepts pass comprehension testing;
- designs cover iOS and Android differences;
- reusable components are linked to a Figma library rather than detached copies;
- text and controls pass agreed contrast and touch-target checks;
- long content, small screens, keyboard-open, loading, empty, and error cases have been validated;
- product, engineering, compliance, and accessibility reviewers approve the handoff;
- proposed product-logic changes are explicitly separated from visual/interaction changes.

## 19. Suggested project phases

### Phase 1 — Discovery and audit

Review the running app, map flows, identify drop-off risks, interview stakeholders, and test the existing payment journey with representative consumers and merchants.

### Phase 2 — Structure and critical flows

Resolve navigation and prototype onboarding, source connection, scan-to-pay, Smart Split, confirmation, payment states, merchant QR, and settlement status.

### Phase 3 — Visual system

Define the refreshed visual language around the retained mint, create the component library, and validate accessibility.

### Phase 4 — Full product application

Apply the system to all P1 screens and supporting states, then complete iOS/Android adaptations.

### Phase 5 — Validation and handoff

Run usability testing, incorporate findings, complete annotations, and conduct product/engineering handoff reviews.

## 20. Open questions for kickoff

1. Is the redesign dark-only, or should designers explore a light theme?
2. Which audience is the launch priority: consumers, merchants, or both simultaneously?
3. Does one account support both consumer and merchant roles, and how should switching work?
4. Which payment methods and source integrations will be live at launch versus demonstrated only?
5. Are fees and FX spread included in the entered amount or added to the total debit?
6. What exact status language has compliance approved for pending collection and settlement?
7. Should balance privacy be enabled by default or controlled by the user?
8. What support and dispute actions will be available from transaction detail?
9. What analytics events and baseline conversion metrics currently exist?
10. Should the product name be standardized as “LenzPay” or “Lenz Pay”?

## 21. Reference route inventory

The current implementation includes approximately 50 screens across:

- authentication and consumer KYC;
- consumer home, notifications, history, rewards, sources, scan/pay, security, profile, settings, rates, and support;
- merchant onboarding, home, payments, analytics, settlement, QR, and settings.

Designers should use the running application and current route inventory as a functional reference, not as a constraint on hierarchy or presentation. Product behavior described in this PRD takes precedence over visual details in the current interface.
