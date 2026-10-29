export function profileValues(data: FormData) {
  const fullName = String(data.get("full_name") ?? "").trim();
  const phone = String(data.get("phone") ?? "").trim();
  if (!fullName || fullName.length > 100)
    return { error: "Enter your name (up to 100 characters)." };
  if (phone && !/^\+?[0-9 ()-]{7,25}$/.test(phone))
    return { error: "Enter a valid phone number, or leave it blank." };
  return { fullName, phone: phone || null };
}
