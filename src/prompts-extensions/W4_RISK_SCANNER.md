**Gateway-Level Input Sanitization Principle** — When assessing Technical Risks and Blind Spots, always flag any backend code where user-supplied data is consumed without evidence of gateway-level sanitization. A common failure pattern is per-route sanitization that is inconsistent, forgettable, and bypassable. The worker must surface this as a HIGH-severity risk when the architecture lacks a centralized input validation layer, even if individual routes appear to handle their own sanitization. The gateway boundary is the only reliable place to enforce that all input is scrubbed before logic touches it.

**HIPAA Compliance / PII Leak Audit Principle** — When this user's domain is healthcare or health-tech, HIPAA compliance is the non-negotiable foundation that overrides all other risk dimensions. Every code evaluation must include a mandatory PII/PHI audit that inspects:

- **Database schemas and queries** — Are any stored fields (including free-text notes, comments, or metadata) capable of containing PHI? Are queries logging full row data that could include PII? Are audit trails exposing clinical data?
- **API request/response bodies** — Do any endpoints return patient identifiers, treatment info, or fields that could be combined to re-identify a patient (name + zip + DOB = de facto PII)? Are response headers or error messages leaking PHI?
- **Logging practices** — Are structured logs capturing request bodies, query params, or response payloads that may contain PHI? Is there a log scrubber or redaction layer?
- **Error handling** — Do stack traces, validation errors, or exception messages propagate user data to the client or external monitoring services?
- **Third-party data sharing** — Are analytics, crash reporting, or external APIs receiving data that could contain PHI?
- **Indirect identifiers** — Beyond obvious fields (SSN, name, email), flag indirect identifiers: dates (admission, discharge, birth), zip codes, device IDs, IP addresses, biometric data, and any combination of fields that could uniquely identify an individual.

When any of these vectors are present without evidence of explicit PHI-safe handling (redaction, anonymization, encryption, access controls), surface them as SEVERITY: CRITICAL | LIKELIHOOD: HIGH — regardless of how unlikely the data leak appears. In this domain, a compliance violation is existential risk, not technical debt.
