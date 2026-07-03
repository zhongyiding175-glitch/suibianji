const BASE_URL = 'http://localhost:3000/api';

function getToken() {
  return wx.getStorageSync('token');
}

function request(method, path, data) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + path,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          getApp().globalData.token = null;
          reject(new Error('登录过期'));
        } else {
          reject(new Error(res.data?.error || '请求失败'));
        }
      },
      fail(err) {
        reject(new Error('网络错误'));
      }
    });
  });
}

const api = {
  login(code, nickname, avatar) {
    return request('POST', '/auth/login', { code, nickname, avatar });
  },
  createBill(raw_text, recorded_at) {
    return request('POST', '/bills', { raw_text, recorded_at });
  },
  getBills(date) {
    const query = date ? `?date=${date}` : '';
    return request('GET', `/bills${query}`);
  },
  deleteBill(id) {
    return request('DELETE', `/bills/${id}`);
  },
  getMonthlyStats(year, month) {
    const params = [];
    if (year) params.push(`year=${year}`);
    if (month) params.push(`month=${month}`);
    return request('GET', `/stats/monthly${params.length ? '?' + params.join('&') : ''}`);
  },
  getWeeklyStats(date) {
    const query = date ? `?date=${date}` : '';
    return request('GET', `/stats/weekly${query}`);
  }
};

module.exports = api;
