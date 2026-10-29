// Role identity in one place.
//
// The three roles are stored as short, stable keys - "Admin", "Manager",
// "Staff" - and shown to people under the names the study uses for them. Keeping
// the two apart is deliberate: the stored value is a key that permission checks
// and existing database rows depend on, while the displayed name is wording that
// can change without a migration.
//
// So: compare against the KEY, render the LABEL. Never the other way round.

export const ROLE_KEYS = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  STAFF: "Staff",
};

export const ROLE_LABELS = {
  Admin: "System Administrator",
  Manager: "Campus Administrator",
  Staff: "Facilities Staff",
};

// Most privileged first, which is the order the Users page counts and lists them.
export const ROLE_ORDER = [ROLE_KEYS.ADMIN, ROLE_KEYS.MANAGER, ROLE_KEYS.STAFF];

export const ROLE_DESCRIPTIONS = {
  Admin: "Manages accounts, buildings, meters and system settings.",
  Manager: "Reviews reports, analytics and building energy records.",
  Staff: "Captures meter photos and records readings.",
};

/**
 * The name to show a person for a stored role value.
 *
 * Falls through to the raw value rather than an empty string: an unrecognised
 * role should look odd in the interface, not invisible.
 */
export function getRoleLabel(role) {
  if (!role) {
    return "Unknown role";
  }

  return ROLE_LABELS[role] || role;
}

/** Shorter form for tight spaces - table cells, chips, the header pill. */
export function getShortRoleLabel(role) {
  if (role === ROLE_KEYS.ADMIN) {
    return "System Admin";
  }

  if (role === ROLE_KEYS.MANAGER) {
    return "Campus Admin";
  }

  return getRoleLabel(role);
}
