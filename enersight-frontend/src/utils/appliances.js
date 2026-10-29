// Checks for the appliance form, shared by the plug-icon appliance manager and the
// appliance list inside Add Building so the two cannot accept different input.
//
// The backend enforces the same bounds (schemas.ApplianceCreate); checking here
// first lets the form say which field is wrong instead of showing a 422.

export const EMPTY_APPLIANCE_FORM = {
  name: "",
  category: "Cooling",
  wattage: "",
  quantity: "1",
  hours_per_day: "",
  days_per_month: "30",
};

/**
 * Returns `{ payload }` ready to POST (without building_id), or `{ error }` with a
 * message for the first field that is wrong.
 */
export function validateApplianceForm(form) {
  const name = String(form?.name ?? "").trim();

  if (!name) {
    return { error: "Please enter the appliance name." };
  }

  const wattage = Number(form.wattage);

  if (form.wattage === "" || !Number.isFinite(wattage) || wattage <= 0) {
    return { error: "Please enter the wattage (watts)." };
  }

  const hours = Number(form.hours_per_day);

  if (form.hours_per_day === "" || !Number.isFinite(hours) || hours < 0) {
    return { error: "Please enter the hours used per day." };
  }

  // The input carries max="24" but there is no wrapping <form>, so the attribute
  // never fires and 30 hours a day used to save fine.
  if (hours > 24) {
    return { error: "Hours per day cannot be more than 24." };
  }

  // `Number(x) || 1` used to turn 0 into 1, and a negative number is truthy so -5
  // passed straight through and produced negative kWh and negative pesos.
  const quantity = Number(form.quantity);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Quantity must be a whole number of 1 or more." };
  }

  const daysPerMonth = Number(form.days_per_month);

  if (!Number.isInteger(daysPerMonth) || daysPerMonth < 1 || daysPerMonth > 31) {
    return { error: "Days per month must be a whole number between 1 and 31." };
  }

  return {
    payload: {
      name,
      category: form.category,
      wattage,
      quantity,
      hours_per_day: hours,
      days_per_month: daysPerMonth,
    },
  };
}

/**
 * True once someone has typed an appliance into the form. Saving a building then
 * would silently drop it, so Add Building asks them to add it to the list first.
 */
export function isApplianceDraftStarted(form) {
  return [form?.name, form?.wattage, form?.hours_per_day].some(
    (value) => String(value ?? "").trim() !== ""
  );
}
