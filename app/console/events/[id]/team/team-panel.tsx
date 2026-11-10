"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatIst } from "@/lib/format";
import { inviteTeamMember, removeTeamMember, revokeTeamDevice } from "./actions";

export type TeamRow = {
  id: string;
  name: string;
  email: string;
  role: "manager" | "door";
  status: "Active" | "Invited";
};

export type DeviceRow = {
  id: string;
  label: string;
  added: string;
};

const roles = [
  { value: "door", label: "Door scanner" },
  { value: "manager", label: "Event manager" },
];

function roleLabel(role: TeamRow["role"]) {
  return role === "door" ? "Door scanner" : "Event manager";
}

export function TeamPanel({
  eventId,
  members,
  devices,
}: {
  eventId: string;
  members: TeamRow[];
  devices: DeviceRow[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("door");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    setLink("");
    const result = await inviteTeamMember({ eventId, email, role });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEmail("");
    setMessage(result.message ?? "Invitation sent.");
    setLink(result.link ?? "");
    router.refresh();
  }

  async function onRemove(memberId: string) {
    setError("");
    const result = await removeTeamMember(eventId, memberId);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  async function onRevoke(deviceId: string) {
    setError("");
    const result = await revokeTeamDevice(eventId, deviceId);
    if (result.error) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={onInvite}
        className="grid gap-3 rounded-2xl border border-line bg-white p-4 md:grid-cols-[2fr_1fr_auto] md:items-end"
      >
        <Input
          label="Email"
          name="email"
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="name@example.com"
          autoComplete="email"
        />
        <Select
          label="Role"
          name="role"
          value={role}
          options={roles}
          onChange={(event) => setRole(event.target.value)}
        />
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Sending…" : "Send invite"}
        </Button>
      </form>
      {error && <p className="font-semibold text-danger">{error}</p>}
      {message && <p className="font-semibold text-ink">{message}</p>}
      {link.startsWith("/team/accept?token=") && (
        <p>
          <a className="font-semibold text-teal underline" href={link}>
            Open the invitation link
          </a>
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[640px] text-left">
          <caption className="sr-only">People on this event team</caption>
          <thead className="bg-soft text-sm text-muted">
            <tr>
              {["Person", "Role", "Status", ""].map((label) => (
                <th key={label} scope="col" className="p-4">
                  {label || "Actions"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-t border-line">
                <td className="p-4">
                  <b>{member.name}</b>
                  {member.name !== member.email && (
                    <small className="mt-1 block font-normal text-muted">{member.email}</small>
                  )}
                </td>
                <td className="p-4">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-bold ${member.role === "door" ? "bg-teal-soft text-teal" : "bg-success-soft text-success"}`}
                  >
                    {roleLabel(member.role)}
                  </span>
                </td>
                <td className="p-4">{member.status}</td>
                <td className="p-4 text-right">
                  <Button type="button" onClick={() => void onRemove(member.id)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!members.length && <p className="p-6 text-muted">No one else is on this team yet.</p>}
      </div>
      <section className="space-y-3">
        <h2 className="text-xl font-extrabold">Phones that can scan offline</h2>
        <p className="text-muted">
          A phone can download this event’s check-in pack for 12 hours. Remove a phone if it was
          lost.
        </p>
        <ul className="space-y-2">
          {devices.map((device) => (
            <li
              key={device.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4"
            >
              <span>
                <b>{device.label}</b>
                <small className="mt-1 block text-muted">Added {formatIst(device.added)}</small>
              </span>
              <Button type="button" onClick={() => void onRevoke(device.id)}>
                Remove phone
              </Button>
            </li>
          ))}
          {!devices.length && <li className="text-muted">No phones have checked in yet.</li>}
        </ul>
      </section>
    </div>
  );
}
