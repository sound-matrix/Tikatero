import "server-only";

import {
  Document,
  Image as TicketImage,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { BRIGHTNESS_HINT, TICKET_TERMS, seatLabel, type TicketFacts } from "./present";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#FFFFFF",
    color: "#2D3142",
    fontFamily: "Helvetica",
    padding: 36,
  },
  test: {
    backgroundColor: "#FBF4DC",
    borderColor: "#C9A227",
    borderWidth: 1,
    color: "#8A6D0B",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    marginBottom: 16,
    padding: 8,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  logo: { height: 36, objectFit: "contain", width: 140 },
  rule: { backgroundColor: "#C9A227", height: 2, marginBottom: 16 },
  row: { flexDirection: "row", gap: 16 },
  copy: { flexGrow: 1, flexShrink: 1 },
  title: { fontFamily: "Helvetica-Bold", fontSize: 22, marginBottom: 8 },
  line: { fontSize: 12, lineHeight: 1.4, marginBottom: 4 },
  muted: { color: "#5C6170", fontSize: 11, lineHeight: 1.4, marginBottom: 4 },
  vip: { color: "#8A6D0B", fontFamily: "Helvetica-Bold", fontSize: 13 },
  tier: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  code: { fontFamily: "Helvetica-Bold", fontSize: 14, marginTop: 8 },
  qr: { height: 160, width: 160 },
  terms: { color: "#5C6170", fontSize: 10, marginTop: 18 },
  footer: { color: "#5C6170", fontSize: 10, marginTop: 12, textAlign: "center" },
  link: { color: "#0E9F9A", fontSize: 11, marginTop: 6 },
});

export function TicketPdf({ facts, logo, qr }: { facts: TicketFacts; logo: string; qr: string }) {
  return (
    <Document title={`${facts.eventTitle} ${facts.code}`}>
      <Page size="A4" style={styles.page}>
        {facts.isTest ? <Text style={styles.test}>TEST TICKET</Text> : null}
        <View style={styles.header}>
          <TicketImage src={logo} style={styles.logo} />
        </View>
        <View style={styles.rule} />
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={styles.title}>{facts.eventTitle}</Text>
            <Text style={styles.line}>{facts.whenLabel}</Text>
            <Text style={styles.line}>{facts.gatesLabel}</Text>
            <Text style={styles.line}>{facts.venueName}</Text>
            {facts.addressLabel ? <Text style={styles.line}>{facts.addressLabel}</Text> : null}
            <Text style={facts.vip ? styles.vip : styles.tier}>
              {facts.tierName}
              {facts.vip ? " · VIP" : ""} · {facts.priceLabel.replace("₹", "Rs ")}
            </Text>
            <Text style={styles.line}>Holder: {facts.holderName}</Text>
            <Text style={styles.line}>{seatLabel(facts.seq, facts.total)}</Text>
            <Text style={styles.code}>{facts.code}</Text>
            {facts.mapsUrl ? (
              <Link src={facts.mapsUrl} style={styles.link}>
                Open in Maps
              </Link>
            ) : null}
          </View>
          <TicketImage src={qr} style={styles.qr} />
        </View>
        <Text style={styles.muted}>{BRIGHTNESS_HINT}</Text>
        <Text style={styles.terms}>{TICKET_TERMS}</Text>
        <Text style={styles.footer}>© Sound Matrix</Text>
      </Page>
    </Document>
  );
}

export function renderTicketPdf(facts: TicketFacts, logo: string, qr: string) {
  return renderToBuffer(<TicketPdf facts={facts} logo={logo} qr={qr} />);
}
