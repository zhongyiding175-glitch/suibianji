Page({
  data: {
    inputText: ''
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  submitBill() {
    const text = this.data.inputText.trim();
    if (!text) return;
    wx.showToast({ title: '已记录: ' + text, icon: 'success' });
    this.setData({ inputText: '' });
  }
});
