import { ADD_BTN, SORT_BTN, DELETE_BTN, MAIN, CARD } from "./styles"
import { getBarcodeLabel, getBarcodePlaceholder, getBarcodeTypeName, detectBarcodeType } from "./../utils/barcode"

const e = [
  "linear-gradient(120deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(120deg, #f6d365 0%, #fda085 100%)",
  "linear-gradient(120deg, #fccb90 0%, #d57eeb 100%)",
  "linear-gradient(120deg, #d4fc79 0%, #96e6a1 100%)",
  "linear-gradient(120deg, #fad0c4 0%, #ffd1ff 100%)",
  "linear-gradient(120deg, #ec008c 0%, #fc6767 100%)",
  "linear-gradient(120deg, #da22ff 0%, #9733ee 100%)",
  "linear-gradient(120deg, #86fde8 0%, #acb6e5 100%)",
  "linear-gradient(120deg, #D31027 0%, #EA384D 100%)",
  "linear-gradient(120deg, #1488CC 0%, #2B32B2 100%)",
]

AppSettingsPage({
  build({settingsStorage: t}) {
    const cards = JSON.parse(t.getItem("cards") || '[{"title": "Example", "code": "0123456789123", "type": "ean13"}]')
    const save = (index, key, value) => {
      cards[index][key] = value
      t.setItem("cards", JSON.stringify(cards))
    }
    const list = View({}, cards.map(((a,n)=>{
      // Migrate old qr boolean to type
      if (a.qr === true && !a.type) {
        a.type = 'qr'
        delete a.qr
        t.setItem("cards", JSON.stringify(cards))
      }
      if (!a.type) a.type = 'ean13'

      const r = a.type === 'ean13' ? (a.code && String(a.code).padStart(13, "0")) : a.code;
      const background = e[Math.floor(n % 10)]
      return Section({ style: { ...CARD, background } }, [
        Section({ style: { minHeight: "50px" } }, [
          TextInput({
            label: "Title",
            placeholder: "Card name",
            value: a.title,
            onChange: e=>{ save(n, "title", e) }
          })
        ]),

        Section({ style: { minHeight: "50px" } }, [
          TextInput({
            label: getBarcodeLabel(a.type),
            placeholder: getBarcodePlaceholder(a.type),
            value: r,
            onChange: e=>{
              save(n, "code", e)
              // Auto-detect and suggest barcode type
              const suggestedType = detectBarcodeType(e)
              if (suggestedType !== a.type) {
                save(n, "type", suggestedType)
              }
            }
          })
        ]),

        Section({ style: { width: "220px" } }, [
          Button({
            label: "Type: " + getBarcodeTypeName(a.type) + " (auto)",
            style: { margin: "10px 0", padding: "10px", fontSize: "13px" },
            onClick: () => {
              const types = ['ean13', 'code39', 'code128', 'qr']
              const currentIndex = types.indexOf(a.type || 'ean13')
              const nextType = types[(currentIndex + 1) % types.length]
              save(n, "type", nextType)
            }
          })
        ]),

        Button({
          label: "↑",
          style: SORT_BTN,
          onClick: () => {
            const e = cards[n - 1];
            e && (cards[n - 1] = cards[n], cards[n] = e, t.setItem("cards", JSON.stringify(cards)))
          }
        }),

        Button({
          label: "×",
          style: DELETE_BTN,
          onClick: () => {
            cards.pop(n)
            t.setItem("cards", JSON.stringify(cards))
          }
        })
      ])
    }
    )));

    return View({ style: MAIN }, [
      list,
      Button({
        label: "+",
        style: ADD_BTN,
        onClick: () => {
          cards.push({})
          t.setItem("cards", JSON.stringify(cards))
        }
      }),

      View({ style: {
        margin: "30px 0",
        color: "#32CD32",
        cursor: "pointer",
      }}, [
        Auth({
          label: 'Leave feadback or suggestions',
          authorizeUrl: 'https://buymeacoffee.com/galulex',
        })
      ]),
    ])
  }
})
