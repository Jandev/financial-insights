# Transaction CSV Files

Drop your bank export files here. The app loads all `*.csv` files in this
directory automatically on startup — this `README.md` is ignored.

> **This folder is gitignored.** Files here are never committed to the repository.

---

## Rabobank

### File naming

Rabobank exports follow this pattern:

```
CSV_A_<IBAN>_EUR_YYYYMM.csv
```

Example: `CSV_A_NL03RABO0150475810_EUR_202406.csv`

### Format

| Property | Value |
|---|---|
| Encoding | Windows-1252 |
| Delimiter | Comma (`,`) — all values double-quoted |
| Decimal separator | Comma (`,`) — e.g. `-10,00` |
| Thousands separator | Period (`.`) — e.g. `+1.234,56` |
| Date format | `YYYY-MM-DD` |
| Columns | 26 (Dutch headers) |

### Transaction codes

| Code | Meaning |
|---|---|
| `bc` | Betaalkaart — card payment (no counterparty IBAN) |
| `cb` | Creditboeking — incoming credit transfer / Tikkie |
| `ei` | Europese Incasso — SEPA direct debit |
| `tb` | Tussenrekening / overboeking — bank transfer |
| `ba` | ATM withdrawal |
| `ga` | ATM (variant) |
| `bg` | Batch payment |
| `db` | Bankkosten / debetrenteverrekening |

### Expected headers (26 columns, single line)

```
"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"
```

### Sample rows

```csv
"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"
"NL00RABO0000000000","EUR","RABONL2U","000000000000000001","2024-06-01","2024-06-01","-10,00","-785,89","","AH Supermarkt","","","","bc","","673001105669","","","","AMSTERDAM, 1012AB, NLD, 17:33",". Pas: 6xxxx0000 pasnr. 001","","","","",""
"NL00RABO0000000000","EUR","RABONL2U","000000000000000002","2024-06-15","2024-06-15","+1.500,00","714,11","NL00INGB0000000000","Werkgever B.V.","","","INGBNL2A","tb","","OO0000000000000001","","","","Salaris juni 2024"," "," ","","","","",""
```

**Row 1** — card payment (`bc`) at a supermarket; no counterparty IBAN.  
**Row 2** — incoming salary transfer (`tb`) with a thousands-separated amount.

---

## ING / SNS / Other banks

Not yet supported. To add a new bank, create
`src/lib/parsers/<bank>.ts` implementing the `BankAdapter` interface and
register it in `src/lib/parsers/index.ts`. See the existing `rabobank.ts` as
a reference implementation.
