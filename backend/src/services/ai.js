const axios = require('axios');

const LLM_API_KEY = process.env.LLM_API_KEY;
const LLM_API_URL = process.env.LLM_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const LLM_MODEL = process.env.LLM_MODEL || 'deepseek-chat';

const VALID_CATEGORIES = ['餐饮', '交通', '购物', '娱乐', '学习', '日用', '收入', '其他'];

const SYSTEM_PROMPT = `你是一个记账分类助手。用户用自然语言描述一笔消费或收入，你需要提取：金额、类型、分类。

分类可选（严格从以下选择一个）：
- 餐饮：吃饭、外卖、食堂、零食、饮料、水果、奶茶
- 交通：地铁、公交、打车、共享单车、加油
- 购物：网购、衣服、数码、日用品购买、快递
- 娱乐：游戏、电影、KTV、旅游、运动
- 学习：书、课程、考试费、打印、文具
- 日用：话费、房租、水电、理发、日用品
- 收入：工资、红包、兼职、退款、报销、生活费

规则：
1. 金额必须是数字，单位为元，保留最多2位小数
2. 如果用户提到收入（工资、红包、退款、生活费到账等），type 为 "income"，category 为 "收入"
3. 否则 type 为 "expense"，category 从6个支出分类中选最匹配的
4. 如果用户输入包含多笔消费，只取第一笔
5. note 字段简短备注（如店名或物品名），可为空字符串

只返回纯JSON（不要markdown代码块包裹）：{"type":"expense","amount":12.5,"category":"餐饮","note":"食堂午饭"}`;

async function classifyBill(rawText) {
  // Quick numeric-only fallback
  if (/^\d+(\.\d{1,2})?$/.test(rawText.trim())) {
    return { type: 'expense', amount: parseFloat(rawText.trim()), category: '其他', note: '' };
  }

  try {
    const response = await axios.post(
      LLM_API_URL,
      {
        model: LLM_MODEL,
        max_tokens: 150,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: rawText.trim() }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${LLM_API_KEY}`
        },
        timeout: 15000
      }
    );

    const text = response.data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');

    const result = JSON.parse(jsonMatch[0]);

    // Validate and sanitize
    if (!['expense', 'income'].includes(result.type)) {
      result.type = 'expense';
    }
    if (!VALID_CATEGORIES.includes(result.category)) {
      result.category = '其他';
    }
    if (typeof result.amount !== 'number' || result.amount <= 0) {
      throw new Error('Invalid amount');
    }

    return {
      type: result.type,
      amount: Math.round(result.amount * 100) / 100,
      category: result.category,
      note: result.note || ''
    };
  } catch (err) {
    console.error('AI classify error:', err.message);
    // Fallback: regex extract amount from text
    const amountMatch = rawText.match(/(\d+(?:\.\d{1,2})?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;
    return { type: 'expense', amount, category: '其他', note: '' };
  }
}

module.exports = { classifyBill };
