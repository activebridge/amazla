let doc = null

export const setDocument = (e) => {
  doc = e?.nativeEvent?.view?.window?.document
  return doc
}

export const getDocument = () => doc
