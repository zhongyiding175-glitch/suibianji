const api = require('../../utils/api');
const { login } = require('../../utils/auth');

const CATEGORY_EMOJI = {
  '餐饮': '🍜', '交通': '🚇', '购物': '🛍',
  '娱乐': '🎮', '学习': '📚', '日用': '🧴',
  '收入': '💰', '其他': '📌'
};
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

Page({
  data: {
    statusTime: '',
    todayDate: '',
    weekday: '',
    todayTotal: '0.00',
    todayCount: 0,
    todayBills: [],
    yesterdayBills: [],
    aiThinking: false,
    inputText: ''
  },

  onLoad() {
    this.updateHeader();
    this.ensureLogin();
  },

  onShow() {
    this.loadBills();
  },

  updateHeader() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const month = now.getMonth() + 1;
    const day = now.getDate();
    this.setData({
      statusTime: `${h}:${m}`,
      todayDate: `${month}月${day}日`,
      weekday: WEEKDAYS[now.getDay()]
    });
  },

  async ensureLogin() {
    const app = getApp();
    if (!app.globalData.token) {
      try {
        const loginData = await login();
        const result = await api.login(loginData.code, loginData.nickname, loginData.avatar);
        app.globalData.token = result.token;
        app.globalData.userInfo = result.user;
        wx.setStorageSync('token', result.token);
        wx.setStorageSync('userInfo', result.user);
      } catch (err) {
        console.error('Login failed:', err);
        wx.showToast({ title: '登录失败，下拉重试', icon: 'none' });
      }
    }
  },

  async loadBills() {
    try {
      const today = this.getDateStr(new Date());
      const yesterday = this.getDateStr(new Date(Date.now() - 86400000));

      const allBills = await api.getBills();
      const todayBills = [];
      const yesterdayBills = [];
      let todayTotal = 0;
      let todayCount = 0;

      allBills.forEach(b => {
        const item = {
          ...b,
          time: b.created_at ? b.created_at.slice(11, 16) : '',
          emoji: CATEGORY_EMOJI[b.category] || '📌',
          amount: b.amount.toFixed(2)
        };
        if (b.recorded_at === today) {
          todayBills.push(item);
          if (b.type === 'expense') { todayTotal += b.amount; todayCount++; }
        } else if (b.recorded_at === yesterday) {
          yesterdayBills.push(item);
        }
      });

      this.setData({
        todayBills, yesterdayBills,
        todayTotal: todayTotal.toFixed(2),
        todayCount
      });
    } catch (err) {
      console.error('Load bills failed:', err);
    }
  },

  async submitBill() {
    const text = this.data.inputText.trim();
    if (!text) return;

    this.setData({ aiThinking: true, inputText: '' });

    try {
      await api.createBill(text);
      this.setData({ aiThinking: false });
      wx.showToast({ title: '已记录', icon: 'success', duration: 1000 });
      this.loadBills();
    } catch (err) {
      this.setData({ aiThinking: false });
      wx.showToast({ title: err.message || '记账失败', icon: 'none' });
    }
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  startVoice() {
    wx.showToast({ title: '语音记账即将支持', icon: 'none' });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  getDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
});
