const api = require('../../utils/api');

const CATEGORY_STYLE = {
  '餐饮': { emoji: '🍜', color: '#FF6B35', bg: 'rgba(255,107,53,0.12)' },
  '交通': { emoji: '🚇', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  '购物': { emoji: '🛍', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  '娱乐': { emoji: '🎮', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  '学习': { emoji: '📚', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  '日用': { emoji: '🧴', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  '收入': { emoji: '💰', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  '其他': { emoji: '📌', color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' }
};

Page({
  data: {
    statusTime: '',
    year: 2026, monthName: 'July',
    totalInt: '0', totalDec: '00',
    vsLastMonth: null, vsAmount: '0', vsPct: '0',
    breakdown: []
  },

  onShow() {
    this.updateTime();
    this.loadStats();
  },

  updateTime() {
    const now = new Date();
    this.setData({ statusTime: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` });
  },

  async loadStats() {
    try {
      const now = new Date();
      const stats = await api.getMonthlyStats(now.getFullYear(), now.getMonth() + 1);

      const totalStr = stats.total.toFixed(2);
      const [totalInt, totalDec] = totalStr.split('.');

      const breakdown = stats.breakdown.map(c => {
        const style = CATEGORY_STYLE[c.category] || CATEGORY_STYLE['其他'];
        return {
          category: c.category,
          amountText: c.amount.toFixed(0),
          amount: c.amount,
          percentage: c.percentage,
          barWidth: Math.max(c.percentage, 4),
          emoji: style.emoji,
          color: style.color,
          bg: style.bg
        };
      });

      const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      let vsLastMonth = null, vsAmount = '0', vsPct = '0';
      if (stats.vs_last_month) {
        const diff = Math.abs(stats.vs_last_month.amount);
        vsLastMonth = true;
        vsAmount = diff.toFixed(0);
        vsPct = Math.abs(stats.vs_last_month.percentage);
      }

      this.setData({
        year: stats.year, monthName: MONTHS[stats.month - 1],
        totalInt, totalDec, breakdown,
        vsLastMonth, vsAmount, vsPct
      });
    } catch (err) {
      console.error('Load stats failed:', err);
    }
  },

  goHome() {
    wx.navigateBack();
  }
});
