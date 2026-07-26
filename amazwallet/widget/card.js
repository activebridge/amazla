AppWidget({
  onInit() {},
  build() {
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0,
      y: 0,
      w: 200,
      h: 60,
      text_size: 20,
      color: 0xffffff,
      align_h: hmUI.align.CENTER_H,
      align_v: hmUI.align.CENTER_V,
      text: 'AmazWallet card',
    })
  },
})
