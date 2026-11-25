import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getTournamentRosterRequirements,
  normalizeTournamentRegistrationDetails,
  registrationCountries,
  validateTournamentRegistrationDetails,
} from "../data/tournamentRegistrationForm.js";

function createInitialValues(user, requirements) {
  const country = registrationCountries.find((item) => item.name === user?.country || item.name === user?.region);
  return {
    roster: Array.from({ length: requirements.totalPlayers }, (_, index) => ({
      inGameName: index === 0 ? user?.inGameName || user?.displayName || user?.username || "" : "",
      gameId: index === 0 ? user?.gameId || "" : "",
    })),
    contactEmail: user?.email || "",
    contactPhone: user?.phoneNumber || user?.phone || "",
    country: country?.name || "",
  };
}

export default function TournamentRegistrationModal({ tournament, user, submitting, onClose, onSubmit }) {
  const dialogRef = useRef(null);
  const requirements = useMemo(() => getTournamentRosterRequirements(tournament), [tournament]);
  const [values, setValues] = useState(() => createInitialValues(user, requirements));
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const initialValues = useMemo(() => createInitialValues(user, requirements), [user, requirements]);
  const hasChanges = JSON.stringify(normalizeTournamentRegistrationDetails(values))
    !== JSON.stringify(normalizeTournamentRegistrationDetails(initialValues));

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector("[data-registration-autofocus]")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected && !previousFocus.disabled) previousFocus.focus();
      else document.querySelector("#registration-feedback")?.focus();
    };
  }, []);

  function requestClose() {
    if (submitting) return;
    if (hasChanges && !window.confirm("Discard the registration details you entered?")) return;
    onClose();
  }

  function updateValues(nextValues) {
    setValues(nextValues);
    setSubmitError("");
    if (submitted) setErrors(validateTournamentRegistrationDetails(tournament, nextValues).errors);
  }

  function updateRoster(index, field, value) {
    updateValues({
      ...values,
      roster: values.roster.map((player, playerIndex) => playerIndex === index
        ? { ...player, [field]: value }
        : player),
    });
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
    const { normalized, errors: validationErrors } = validateTournamentRegistrationDetails(tournament, values);
    setErrors(validationErrors);
    setSubmitError("");
    if (Object.keys(validationErrors).length) return;

    try {
      const result = await onSubmit(normalized);
      if (!result?.ok) setSubmitError(result?.message || "Registration could not be completed. Please try again.");
    } catch (error) {
      setSubmitError(error?.message || "Registration could not be completed. Please try again.");
    }
  }

  function renderError(field) {
    return errors[field] && <span className="tournament-registration-field-error" id={`${field}-error`} role="alert">{errors[field]}</span>;
  }

  return createPortal(
    <div
      className="tournament-registration-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        ref={dialogRef}
        className="tournament-registration-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tournament-registration-title"
        aria-describedby="tournament-registration-description"
        onKeyDown={handleKeyDown}
      >
        <header className="tournament-registration-header">
          <div>
            <p className="eyebrow">TOURNAMENT REGISTRATION</p>
            <h2 id="tournament-registration-title">Register your roster</h2>
            <p id="tournament-registration-description">{tournament.name}</p>
          </div>
          <button className="tournament-registration-close" type="button" aria-label="Close registration form" onClick={requestClose} disabled={submitting}>×</button>
        </header>

        <form className="tournament-registration-form" noValidate onSubmit={handleSubmit}>
          <div className="tournament-registration-body">
            <p className="tournament-registration-roster-note">
              Enter details for {requirements.totalPlayers} {requirements.totalPlayers === 1 ? "player" : "players"}.
              {requirements.substitutes > 0 && ` This roster includes ${requirements.substitutes} required ${requirements.substitutes === 1 ? "substitute" : "substitutes"}.`}
            </p>

            <fieldset className="tournament-registration-roster">
              <legend>Player details</legend>
              {values.roster.map((player, index) => {
                const isPrimaryPlayer = index === 0;
                const isSubstitute = index >= requirements.starters;
                const label = isPrimaryPlayer ? "You" : isSubstitute
                  ? `Substitute ${index - requirements.starters + 1}`
                  : `Teammate ${index}`;
                const nameField = `roster.${index}.inGameName`;
                const idField = `roster.${index}.gameId`;
                const nameError = errors[nameField];
                const idError = errors[idField];
                return <div className="tournament-registration-player" key={nameField}>
                  <h3>{label}</h3>
                  <label>
                    <span>In-game name{isPrimaryPlayer ? "" : ` - ${label}`}</span>
                    <input
                      data-registration-autofocus={isPrimaryPlayer ? "" : undefined}
                      type="text"
                      disabled={submitting}
                      autoComplete="nickname"
                      maxLength={32}
                      value={player.inGameName}
                      className={nameError ? "has-error" : ""}
                      aria-invalid={Boolean(nameError)}
                      aria-describedby={nameError ? `${nameField}-error` : undefined}
                      onChange={(event) => updateRoster(index, "inGameName", event.target.value)}
                    />
                    {renderError(nameField)}
                  </label>
                  <label>
                    <span>In-game ID / UID{isPrimaryPlayer ? "" : ` - ${label}`}</span>
                    <input
                      type="text"
                      disabled={submitting}
                      autoComplete="off"
                      maxLength={64}
                      value={player.gameId}
                      className={idError ? "has-error" : ""}
                      aria-invalid={Boolean(idError)}
                      aria-describedby={idError ? `${idField}-error` : undefined}
                      onChange={(event) => updateRoster(index, "gameId", event.target.value)}
                    />
                    {renderError(idField)}
                  </label>
                </div>;
              })}
              {renderError("roster")}
            </fieldset>

            <fieldset className="tournament-registration-contact">
              <legend>Contact details</legend>
              <label>
                <span>Contact email</span>
                <input
                  type="email"
                  disabled={submitting}
                  autoComplete="email"
                  maxLength={254}
                  value={values.contactEmail}
                  className={errors.contactEmail ? "has-error" : ""}
                  aria-invalid={Boolean(errors.contactEmail)}
                  aria-describedby={errors.contactEmail ? "contactEmail-error" : undefined}
                  onChange={(event) => updateValues({ ...values, contactEmail: event.target.value })}
                />
                {renderError("contactEmail")}
              </label>
              <label>
                <span>Contact phone (include country code)</span>
                <input
                  type="tel"
                  disabled={submitting}
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  value={values.contactPhone}
                  className={errors.contactPhone ? "has-error" : ""}
                  aria-invalid={Boolean(errors.contactPhone)}
                  aria-describedby={errors.contactPhone ? "contactPhone-error" : undefined}
                  onChange={(event) => updateValues({ ...values, contactPhone: event.target.value })}
                />
                {renderError("contactPhone")}
              </label>
              <label>
                <span>Country / region</span>
                <select
                  autoComplete="country-name"
                  disabled={submitting}
                  value={values.country}
                  className={errors.country ? "has-error" : ""}
                  aria-invalid={Boolean(errors.country)}
                  aria-describedby={errors.country ? "country-error" : undefined}
                  onChange={(event) => updateValues({ ...values, country: event.target.value })}
                >
                  <option value="">Select your country or region</option>
                  {registrationCountries.map((country) => <option value={country.name} key={country.name}>{country.name}</option>)}
                </select>
                {renderError("country")}
              </label>
            </fieldset>

            {submitError && <p className="tournament-registration-submit-error" role="alert">{submitError}</p>}
          </div>

          <footer className="tournament-registration-actions">
            <button className="btn o" type="button" onClick={requestClose} disabled={submitting}>Cancel</button>
            <button className="btn p" type="submit" disabled={submitting}>{submitting ? "Submitting…" : "Submit Registration"}</button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}
