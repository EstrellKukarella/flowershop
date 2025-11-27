const express = require('express');
const cors = require('cors');
const axios = require('axios');
const compression = require('compression');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Переменные окружения
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || '';
const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PROJECT_TYPE = process.env.PROJECT_TYPE || 'flowers';

// Функция для получения имён таблиц
const getTableName = (baseName) => {
  if (PROJECT_TYPE === 'flowers') {
    return `flowers_${baseName}`;
  }
  return baseName;
};

console.log(`🌸 Запуск сервера для цветочного магазина`);
console.log(`📊 Таблицы: ${getTableName('orders')}, ${getTableName('customers')}, ${getTableName('products')}, ${getTableName('settings')}`);

// Welcome текст для цветочного магазина
const getWelcomeText = (firstName, languageCode) => {
  return languageCode === 'kk' ? 
    `🌸 Қош келдіңіз, ${firstName}!

Бұл бот не істей алады?
Mini App ашып, жаңа гүлдерді есігіңізге жеткізуге тапсырыс беріңіз!

💐 Біздің гүл дүкені — жаңа гүлдер мен шоқтар

Ассортимент:
🌹 Раушандар
🌷 Қызғалдақтар
💐 Дайын шоқтар
🌸 Композициялар
🌺 Монобукеттер
💒 Үйлену шоқтары

💳 Төлем: Kaspi немесе қолма-қол
🚚 Астана бойынша жеткізу
⭐ Бірінші тапсырысқа 10% жеңілдік!` 
    : 
    `🌸 Добро пожаловать, ${firstName}!

Что умеет этот бот?
Откройте наш Mini App и заказывайте свежие цветы с доставкой прямо к вашей двери!

💐 Наша цветочная лавка — свежие цветы и букеты

Ассортимент:
🌹 Розы
🌷 Тюльпаны
💐 Готовые букеты
🌸 Композиции
🌺 Монобукеты
💒 Свадебные букеты

💳 Оплата: Kaspi или наличными
🚚 Доставка по Астане
⭐ Скидка 10% на первый заказ!`;
};

// URL приложений
const CLIENT_APP_URL = process.env.CLIENT_APP_URL || "https://flowershop-6jdk.onrender.com";
const ADMIN_APP_URL = process.env.ADMIN_APP_URL || "https://flowershop-6jdk.onrender.com/admin.html";

// Проверка конфигурации
if (!BOT_TOKEN || !ADMIN_ID || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('⚠️  Заполните все переменные окружения!');
}

// Supabase клиент
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Хранилище для временных данных
const pendingReceipts = new Map();

// Форматирование времени
const formatDateTimeAstana = (utcDate) => {
  if (!utcDate) return 'Неизвестно';
  const date = new Date(utcDate);
  return date.toLocaleString('ru-RU', {
    timeZone: 'Asia/Almaty',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// API: Отправка заказа
app.post('/api/send-order', async (req, res) => {
  try {
    const { 
      orderId, 
      date, 
      customerName, 
      customerPhone, 
      customerComment,
      telegramUserId, 
      telegramUsername, 
      items, 
      total,
      paymentEnabled,
      kaspiPhone,
      kaspiLink
    } = req.body;

    if (!orderId || !items || !total) {
      return res.status(400).json({ error: 'Неверные данные заказа' });
    }

    // Сообщение админу
    let message = "🆕 <b>НОВЫЙ ЗАКАЗ!</b>\n\n";
    message += `📋 Заказ #${orderId.slice(-6)}\n`;
    message += `📅 ${formatDateTimeAstana(date)}\n\n`;
    
    message += "<b>👤 Клиент:</b>\n";
    message += `Имя: ${customerName}\n`;
    message += `Телефон: ${customerPhone}\n`;
    if (telegramUsername) message += `Telegram: @${telegramUsername}\n`;
    if (telegramUserId) message += `ID: ${telegramUserId}\n`;
    if (customerComment) message += `\nКомментарий: ${customerComment}\n`;
    
    message += "\n<b>💐 Товары:</b>\n";
    items.forEach(item => {
      message += `• ${item.name} x${item.quantity} = ${item.price * item.quantity} ₸\n`;
    });
    
    message += `\n<b>💰 Итого: ${total} ₸</b>`;

    if (paymentEnabled) {
      message += `\n\n⏰ <b>Статус:</b> Ожидает оплаты`;
    }

    // Отправка админу
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: ADMIN_ID,
      text: message,
      parse_mode: 'HTML'
    });

    // Если включены платежи
    if (paymentEnabled && telegramUserId) {
      let paymentMessage = "💳 <b>Реквизиты для оплаты / Төлем деректемелері</b>\n\n";
      paymentMessage += `📋 Заказ / Тапсырыс #${orderId.slice(-6)}\n`;
      paymentMessage += `💰 Сумма / Сомасы: <b>${total} ₸</b>\n\n`;
      
      if (kaspiPhone) {
        paymentMessage += `📱 <b>Kaspi номер:</b>\n+7${kaspiPhone}\n\n`;
      }
      
      paymentMessage += "После оплаты нажмите кнопку ниже и отправьте скриншот чека.\n";
      paymentMessage += "Төлегеннен кейін төмендегі батырманы басып, чектің скриншотын жіберіңіз.\n\n";
      paymentMessage += "Спасибо за заказ! / Тапсырысыңызға рахмет! 💐";

      const keyboard = {
        inline_keyboard: []
      };

      if (kaspiLink) {
        keyboard.inline_keyboard.push([
          { text: "💳 Оплатить через Kaspi", url: kaspiLink }
        ]);
      }

      keyboard.inline_keyboard.push([
        { text: "📤 Подтвердить оплату", callback_data: `receipt_${orderId}` }
      ]);

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: telegramUserId,
        text: paymentMessage,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });

      pendingReceipts.set(orderId, {
        userId: telegramUserId,
        orderNumber: orderId.slice(-6),
        total: total,
        customerName: customerName
      });
    }

    res.json({ success: true, message: 'Заказ успешно отправлен' });

  } catch (error) {
    console.error('Ошибка отправки заказа:', error);
    res.status(500).json({ 
      error: 'Ошибка отправки заказа',
      details: error.message 
    });
  }
});

// API: Изменение статуса заказа
app.post('/api/notify-status', async (req, res) => {
  try {
    const { userId, status, orderNumber, shopPhone } = req.body;

    if (!userId || !status || !orderNumber) {
      return res.status(400).json({ error: 'Неверные данные' });
    }

    const statusMessages = {
      pending: {
        ru: `⏰ <b>Заказ #${orderNumber}</b>\n\nВаш заказ получен и ожидает обработки.\n\nМы скоро свяжемся с вами! 🌸`,
        kk: `⏰ <b>Тапсырыс #${orderNumber}</b>\n\nТапсырысыңыз алынды және өңдеуді күтуде.\n\nЖақында сізбен хабарласамыз! 🌸`
      },
      processing: {
        ru: `👨‍🍳 <b>Заказ #${orderNumber}</b>\n\nМы готовим ваш букет!\n\nСкоро будет готов к доставке 💐`,
        kk: `👨‍🍳 <b>Тапсырыс #${orderNumber}</b>\n\nБіз сіздің шоғыңызды дайындап жатырмыз!\n\nЖақында жеткізуге дайын болады 💐`
      },
      ready: {
        ru: `✅ <b>Заказ #${orderNumber}</b>\n\nВаш букет готов!\n\nСкоро будет доставлен 🚚`,
        kk: `✅ <b>Тапсырыс #${orderNumber}</b>\n\nСіздің шоғыңыз дайын!\n\nЖақында жеткізіледі 🚚`
      },
      delivered: {
        ru: `🎉 <b>Заказ #${orderNumber}</b>\n\nБукет доставлен!\n\nСпасибо за заказ! Будем рады видеть вас снова 🌷`,
        kk: `🎉 <b>Тапсырыс #${orderNumber}</b>\n\nШоқ жеткізілді!\n\nТапсырысыңызға рахмет! Сізді қайта көруге қуаныштымыз 🌷`
      },
      cancelled: {
        ru: `❌ <b>Заказ #${orderNumber}</b>\n\nЗаказ отменён.\n\nЕсли у вас есть вопросы, свяжитесь с нами${shopPhone ? `: ${shopPhone}` : ''}`,
        kk: `❌ <b>Тапсырыс #${orderNumber}</b>\n\nТапсырыс жойылды.\n\nСұрақтарыңыз болса, бізбен байланысыңыз${shopPhone ? `: ${shopPhone}` : ''}`
      }
    };

    const messages = statusMessages[status];
    if (!messages) {
      return res.status(400).json({ error: 'Неизвестный статус' });
    }

    // Отправляем оба языка
    const fullMessage = messages.ru + '\n\n' + messages.kk;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: userId,
      text: fullMessage,
      parse_mode: 'HTML'
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Ошибка уведомления:', error);
    res.status(500).json({ 
      error: 'Ошибка уведомления',
      details: error.message 
    });
  }
});

// Webhook обработчик
app.post(['/webhook', `/bot${BOT_TOKEN}`], async (req, res) => {
  try {
    const update = req.body;

    // Обработка команды /start
    if (update.message && update.message.text && update.message.text.startsWith('/start')) {
      const chatId = update.message.chat.id;
      const firstName = update.message.from.first_name || 'друг';
      const languageCode = update.message.from.language_code;
      const userId = update.message.from.id;
      const username = update.message.from.username;

      // Сохранение клиента
      const { data: existingCustomer } = await supabase
        .from(getTableName('customers'))
        .select('*')
        .eq('telegram_user_id', userId)
        .single();

      if (!existingCustomer) {
        await supabase.from(getTableName('customers')).insert({
          telegram_user_id: userId,
          telegram_username: username,
          first_name: firstName,
          language_code: languageCode
        });
      }

      const welcomeText = getWelcomeText(firstName, languageCode);

      const keyboard = {
        inline_keyboard: [[
          { 
            text: languageCode === 'kk' ? '🌸 Гүл таңдау' : '🌸 Выбрать букет',
            web_app: { url: CLIENT_APP_URL }
          }
        ]]
      };

      // Если админ
      if (chatId === ADMIN_ID) {
        keyboard.inline_keyboard.push([
          { 
            text: '⚙️ Админ-панель',
            web_app: { url: ADMIN_APP_URL }
          }
        ]);
      }

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: welcomeText,
        parse_mode: 'HTML',
        reply_markup: keyboard
      });
    }

    // Команда /stats (только для админа)
    if (update.message && update.message.text === '/stats') {
      const chatId = update.message.chat.id;

      if (chatId !== ADMIN_ID) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '❌ Эта команда доступна только админу'
        });
        return res.json({ ok: true });
      }

      try {
        // Получаем все данные
        const { data: allOrders } = await supabase
          .from(getTableName('orders'))
          .select('*')
          .order('created_at', { ascending: false });

        const { data: customers } = await supabase
          .from(getTableName('customers'))
          .select('*');

        const { data: products } = await supabase
          .from(getTableName('products'))
          .select('*');

        // Общая статистика
        const totalOrders = allOrders?.filter(o => o.status === 'delivered').length || 0;
        const totalRevenue = allOrders
          ?.filter(o => o.status === 'delivered')
          .reduce((sum, o) => sum + (o.total || 0), 0) || 0;
        
        const totalCustomers = customers?.length || 0;
        const totalProducts = products?.length || 0;
        const availableProducts = products?.filter(p => p.available).length || 0;
        
        // Средний чек
        const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

        // Статистика за период
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const todayOrders = allOrders?.filter(o => 
          o.status === 'delivered' && new Date(o.created_at) >= todayStart
        ).length || 0;
        
        const todayRevenue = allOrders
          ?.filter(o => o.status === 'delivered' && new Date(o.created_at) >= todayStart)
          .reduce((sum, o) => sum + (o.total || 0), 0) || 0;

        const weekOrders = allOrders?.filter(o => 
          o.status === 'delivered' && new Date(o.created_at) >= weekStart
        ).length || 0;
        
        const weekRevenue = allOrders
          ?.filter(o => o.status === 'delivered' && new Date(o.created_at) >= weekStart)
          .reduce((sum, o) => sum + (o.total || 0), 0) || 0;

        const monthOrders = allOrders?.filter(o => 
          o.status === 'delivered' && new Date(o.created_at) >= monthStart
        ).length || 0;
        
        const monthRevenue = allOrders
          ?.filter(o => o.status === 'delivered' && new Date(o.created_at) >= monthStart)
          .reduce((sum, o) => sum + (o.total || 0), 0) || 0;

        // Статусы
        const pendingOrders = allOrders?.filter(o => o.status === 'pending').length || 0;
        const processingOrders = allOrders?.filter(o => o.status === 'processing').length || 0;
        const readyOrders = allOrders?.filter(o => o.status === 'ready').length || 0;
        const deliveredOrders = allOrders?.filter(o => o.status === 'delivered').length || 0;
        const cancelledOrders = allOrders?.filter(o => o.status === 'cancelled').length || 0;

        // Топ-3 популярных товаров
        const productSales = {};
        allOrders?.forEach(order => {
          if (order.items) {
            order.items.forEach(item => {
              if (!productSales[item.name]) {
                productSales[item.name] = { count: 0, revenue: 0 };
              }
              productSales[item.name].count += item.quantity;
              productSales[item.name].revenue += item.price * item.quantity;
            });
          }
        });
        
        const topProducts = Object.entries(productSales)
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, 3);

        // Формируем сообщение
        let statsText = '📊 <b>СТАТИСТИКА ЦВЕТОЧНОЙ ЛАВКИ</b>\n\n';
        statsText += '━━━━━━━━━━━━━━━━━━━━\n';
        statsText += '📈 <b>ОБЩАЯ СТАТИСТИКА</b>\n\n';
        statsText += `💰 Общий доход: <b>${totalRevenue.toFixed(0)} ₸</b>\n`;
        statsText += `📦 Всего заказов: <b>${totalOrders}</b>\n`;
        statsText += `💵 Средний чек: <b>${avgOrderValue} ₸</b>\n`;
        statsText += `👥 Клиентов: <b>${totalCustomers}</b>\n`;
        statsText += `🌸 Товаров: <b>${totalProducts}</b> (в наличии: ${availableProducts})\n\n`;
        
        statsText += '━━━━━━━━━━━━━━━━━━━━\n';
        statsText += '📅 <b>ЗА СЕГОДНЯ</b>\n\n';
        statsText += `📦 Заказов: <b>${todayOrders}</b>\n`;
        statsText += `💰 Доход: <b>${todayRevenue.toFixed(0)} ₸</b>\n\n`;
        
        statsText += '━━━━━━━━━━━━━━━━━━━━\n';
        statsText += '📅 <b>ЗА НЕДЕЛЮ</b>\n\n';
        statsText += `📦 Заказов: <b>${weekOrders}</b>\n`;
        statsText += `💰 Доход: <b>${weekRevenue.toFixed(0)} ₸</b>\n\n`;
        
        statsText += '━━━━━━━━━━━━━━━━━━━━\n';
        statsText += '📅 <b>ЗА МЕСЯЦ</b>\n\n';
        statsText += `📦 Заказов: <b>${monthOrders}</b>\n`;
        statsText += `💰 Доход: <b>${monthRevenue.toFixed(0)} ₸</b>\n\n`;
        
        statsText += '━━━━━━━━━━━━━━━━━━━━\n';
        statsText += '📋 <b>СТАТУСЫ ЗАКАЗОВ</b>\n\n';
        statsText += `⏰ Ожидают: <b>${pendingOrders}</b>\n`;
        statsText += `👨‍🍳 В работе: <b>${processingOrders}</b>\n`;
        statsText += `✅ Готовы: <b>${readyOrders}</b>\n`;
        statsText += `🎉 Доставлено: <b>${deliveredOrders}</b>\n`;
        statsText += `❌ Отменено: <b>${cancelledOrders}</b>\n\n`;
        
        if (topProducts.length > 0) {
          statsText += '━━━━━━━━━━━━━━━━━━━━\n';
          statsText += '🏆 <b>ТОП-3 ТОВАРОВ</b>\n\n';
          topProducts.forEach((p, i) => {
            statsText += `${i + 1}. ${p[0]}: ${p[1].count} шт (${p[1].revenue} ₸)\n`;
          });
          statsText += '\n';
        }
        
        statsText += '━━━━━━━━━━━━━━━━━━━━\n';
        statsText += `🕐 Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}`;

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: statsText,
          parse_mode: 'HTML'
        });
      } catch (error) {
        console.error('Ошибка получения статистики:', error);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '❌ Ошибка получения статистики'
        });
      }
    }

    // Команда /broadcast (только для админа)
    if (update.message && update.message.text === '/broadcast') {
      const chatId = update.message.chat.id;

      if (chatId !== ADMIN_ID) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '❌ Эта команда доступна только админу'
        });
        return res.json({ ok: true });
      }

      const instructionsText = `📢 <b>РАССЫЛКА</b>

Чтобы отправить рассылку, отправьте сообщение в формате:

<code>/send
Текст на русском

---

Қазақша мәтін</code>

Разделитель между языками: <code>---</code>

<b>Пример:</b>
<code>/send
🎉 Скидка 20% на все букеты!
Только сегодня!

---

🎉 Барлық шоқтарға 20% жеңілдік!
Тек бүгін!</code>`;

      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: instructionsText,
        parse_mode: 'HTML'
      });
    }

    // Команда /send (отправка рассылки)
    if (update.message && update.message.text && update.message.text.startsWith('/send')) {
      const chatId = update.message.chat.id;

      if (chatId !== ADMIN_ID) {
        return res.json({ ok: true });
      }

      try {
        const fullText = update.message.text.replace('/send', '').trim();
        
        if (!fullText.includes('---')) {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: '❌ Неверный формат! Используйте разделитель ---\n\nИспользуйте /broadcast для инструкций'
          });
          return res.json({ ok: true });
        }

        const [messageRu, messageKk] = fullText.split('---').map(s => s.trim());

        if (!messageRu || !messageKk) {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: '❌ Заполните сообщения на обоих языках!'
          });
          return res.json({ ok: true });
        }

        // Получаем всех клиентов
        const { data: customers } = await supabase
          .from(getTableName('customers'))
          .select('*');

        if (!customers || customers.length === 0) {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: '❌ Нет клиентов для рассылки'
          });
          return res.json({ ok: true });
        }

        // Подтверждение
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `📢 Начинаю рассылку для ${customers.length} клиентов...`,
          parse_mode: 'HTML'
        });

        let sentCount = 0;
        let errorCount = 0;

        // Отправляем каждому клиенту
        for (const customer of customers) {
          try {
            if (!customer.telegram_user_id) continue;

            const lang = customer.language_code || 'ru';
            const message = lang === 'kk' ? messageKk : messageRu;

            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: customer.telegram_user_id,
              text: message,
              parse_mode: 'HTML'
            });

            sentCount++;
            await new Promise(resolve => setTimeout(resolve, 50));

          } catch (error) {
            errorCount++;
            console.error(`Ошибка отправки ${customer.telegram_user_id}:`, error.message);
          }
        }

        // Отчёт админу
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `✅ <b>Рассылка завершена!</b>\n\n📤 Отправлено: ${sentCount}\n❌ Ошибок: ${errorCount}`,
          parse_mode: 'HTML'
        });

      } catch (error) {
        console.error('Ошибка рассылки:', error);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '❌ Ошибка отправки рассылки'
        });
      }
    }

    // Обработка callback (чеки)
    if (update.callback_query) {
      const callbackQuery = update.callback_query;
      const chatId = callbackQuery.message.chat.id;
      const messageId = callbackQuery.message.message_id;
      const data = callbackQuery.data;

      // Клиент отправляет чек
      if (data.startsWith('receipt_')) {
        const orderId = data.replace('receipt_', '');

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id,
          text: '📸 Отправьте фото чека'
        });

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: "📸 <b>Отправьте фото чека</b>\n\nПожалуйста, отправьте скриншот оплаты.\n\n🇰🇿 <b>Чектің фотосын жіберіңіз</b>\n\nТөлем скриншотын жіберіңіз.",
          parse_mode: 'HTML'
        });

        pendingReceipts.set(`waiting_${chatId}`, orderId);
      }

      // Админ подтверждает оплату
      if (data.startsWith('confirm_payment_')) {
        const orderId = data.replace('confirm_payment_', '');
        
        await supabase
          .from(getTableName('orders'))
          .update({ status: 'processing' })
          .eq('id', orderId);

        const { data: order } = await supabase
          .from(getTableName('orders'))
          .select('*')
          .eq('id', orderId)
          .single();

        // СПИСЫВАЕМ ОСТАТКИ ТОВАРОВ
        if (order && order.items) {
          for (const item of order.items) {
            // Получаем текущий товар
            const { data: product } = await supabase
              .from(getTableName('products'))
              .select('stock')
              .eq('name', item.name)
              .single();

            if (product && product.stock !== undefined) {
              const newStock = Math.max(0, product.stock - item.quantity);
              
              // Обновляем остаток
              await supabase
                .from(getTableName('products'))
                .update({ 
                  stock: newStock,
                  available: newStock > 0 // Автоматически скрываем если закончился
                })
                .eq('name', item.name);

              console.log(`📦 Списание: ${item.name} -${item.quantity} (осталось: ${newStock})`);
            }
          }
        }

        let lang = 'ru'; // По умолчанию русский

        if (order && order.telegram_user_id) {
          // Получаем язык клиента
          const { data: customer } = await supabase
            .from(getTableName('customers'))
            .select('language_code')
            .eq('telegram_user_id', order.telegram_user_id)
            .single();

          lang = customer?.language_code || 'ru';

          const messageText = lang === 'kk'
            ? `✅ <b>Төлем расталды!</b>\n\n📋 Тапсырыс #${orderId}\n\nТапсырысыңызды қабылдадық! 🌸`
            : `✅ <b>Оплата подтверждена!</b>\n\n📋 Заказ #${orderId}\n\nМы приняли ваш заказ в работу! 🌸`;

          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: order.telegram_user_id,
            text: messageText,
            parse_mode: 'HTML'
          });
        }

        const callbackText = lang === 'kk' ? '✅ Төлем расталды!' : '✅ Оплата подтверждена!';

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id,
          text: callbackText
        });

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
          chat_id: ADMIN_ID,
          message_id: messageId,
          caption: callbackQuery.message.caption + '\n\n✅ <b>ОПЛАТА ПОДТВЕРЖДЕНА</b>',
          parse_mode: 'HTML'
        });
      }

      // Админ отклоняет оплату
      if (data.startsWith('reject_payment_')) {
        const orderId = data.replace('reject_payment_', '');
        
        const { data: order } = await supabase
          .from(getTableName('orders'))
          .select('*')
          .eq('id', orderId)
          .single();

        if (order && order.telegram_user_id) {
          pendingReceipts.set(`waiting_${order.telegram_user_id}`, orderId);
          
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: order.telegram_user_id,
            text: `❌ <b>Чек не принят</b>\n\n📋 Заказ #${orderId.slice(-6)}\n\nПожалуйста, отправьте корректный чек.\n\n🇰🇿 <b>Чек қабылданбады</b>\n\nДұрыс чекті жіберіңіз.`,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: '📸 Отправить чек заново', callback_data: `receipt_${orderId}` }
              ]]
            }
          });
        }

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id,
          text: '❌ Чек отклонён'
        });

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageCaption`, {
          chat_id: ADMIN_ID,
          message_id: messageId,
          caption: callbackQuery.message.caption + '\n\n❌ <b>ЧЕК ОТКЛОНЁН</b>',
          parse_mode: 'HTML'
        });
      }
    }

    // Обработка фото (чека или букета/доставки)
    if (update.message && update.message.photo) {
      const chatId = update.message.chat.id;
      const photo = update.message.photo[update.message.photo.length - 1];
      
      // Проверяем - это чек от клиента или фото от админа?
      const waitingReceipt = pendingReceipts.get(`waiting_${chatId}`);
      
      // ВАРИАНТ 1: Клиент отправляет чек
      if (waitingReceipt) {
        const orderInfo = pendingReceipts.get(waitingReceipt);
        
        if (orderInfo) {
          let caption = "📸 <b>ЧЕК ОБ ОПЛАТЕ</b>\n\n";
          caption += `📋 Заказ #${orderInfo.orderNumber}\n`;
          caption += `👤 ${orderInfo.customerName}\n`;
          caption += `💰 ${orderInfo.total} ₸\n`;
          caption += `ID: ${orderInfo.userId}`;

          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            chat_id: ADMIN_ID,
            photo: photo.file_id,
            caption: caption,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[
                { text: "✅ Подтвердить", callback_data: `confirm_payment_${waitingReceipt}` },
                { text: "❌ Отклонить", callback_data: `reject_payment_${waitingReceipt}` }
              ]]
            }
          });

          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: "✅ <b>Чек получен!</b>\n\nМы проверим оплату и скоро свяжемся с вами.\n\n🇰🇿 <b>Чек алынды!</b>\nТөлемді тексеріп, жақында сізбен хабарласамыз.",
            parse_mode: 'HTML'
          });

          pendingReceipts.delete(`waiting_${chatId}`);
        }
      }
      // ВАРИАНТ 2: Админ отправляет фото букета/доставки
      else if (chatId === ADMIN_ID) {
        console.log('📸 Админ отправил фото, проверяем pendingReceipts...');
        console.log('🔑 Все ключи:', Array.from(pendingReceipts.keys()));
        
        // Ищем ожидающее фото для этого админа
        let foundKey = null;
        let photoData = null;
        
        for (const [key, value] of pendingReceipts.entries()) {
          if (key.startsWith(`photo_${ADMIN_ID}_`)) {
            foundKey = key;
            photoData = value;
            break;
          }
        }
        
        if (foundKey && photoData) {
          console.log('✅ Найдено ожидающее фото:', foundKey, photoData);
          
          const { orderId, customerId, photoType } = photoData;
          
          // Получаем язык клиента
          const { data: customer } = await supabase
            .from(getTableName('customers'))
            .select('language_code')
            .eq('telegram_user_id', customerId)
            .single();
          
          const lang = customer?.language_code || 'ru';
          
          // Формируем сообщение
          const messages = {
            bouquet: {
              ru: `💐 <b>Ваш букет готов!</b>\n\n📋 Заказ #${orderId}\n\nМы подготовили для вас красивый букет! 🌸`,
              kk: `💐 <b>Сіздің шоғыңыз дайын!</b>\n\n📋 Тапсырыс #${orderId}\n\nБіз сіз үшін әдемі шоқ дайындадық! 🌸`
            },
            delivery: {
              ru: `📦 <b>Букет доставлен!</b>\n\n📋 Заказ #${orderId}\n\nВаш заказ успешно доставлен! Спасибо за покупку! 🎉`,
              kk: `📦 <b>Шоқ жеткізілді!</b>\n\n📋 Тапсырыс #${orderId}\n\nТапсырысыңыз сәтті жеткізілді! Сатып алғаныңызға рахмет! 🎉`
            }
          };
          
          const messageText = messages[photoType] ? messages[photoType][lang] : messages.bouquet[lang];
          
          // Отправляем фото клиенту
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            chat_id: customerId,
            photo: photo.file_id,
            caption: messageText,
            parse_mode: 'HTML'
          });
          
          // Подтверждаем админу
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: `✅ Фото отправлено клиенту!\n📋 Заказ #${orderId}`,
            parse_mode: 'HTML'
          });
          
          // Удаляем из ожидания
          pendingReceipts.delete(foundKey);
          console.log('🗑️ Удалили ключ:', foundKey);
        } else {
          console.log('❌ Не найдено ожидающих фото для админа');
        }
      }
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка обработки webhook:', error);
    res.json({ ok: true });
  }
});

// API: Запрос на фото от админа
app.post('/api/send-photo-prompt', async (req, res) => {
  try {
    const { orderId, telegramUserId, photoType } = req.body;

    console.log('📸 Запрос на фото:', { orderId, telegramUserId, photoType });

    if (!orderId || !telegramUserId || !photoType) {
      return res.status(400).json({ error: 'Неверные данные' });
    }

    // Сохраняем ожидание фото от админа
    // ВАЖНО: добавляем photoType в ключ чтобы можно было отправить букет И доставку!
    const key = `photo_${ADMIN_ID}_${orderId}_${photoType}`;
    pendingReceipts.set(key, {
      orderId,
      customerId: telegramUserId,
      photoType
    });
    
    console.log('✅ Сохранили в pendingReceipts:', key);
    console.log('📋 Текущие ключи:', Array.from(pendingReceipts.keys()));

    const messages = {
      bouquet: {
        ru: '💐 <b>Отправьте фото букета</b>\n\nЗагрузите фото готового букета для заказа #' + orderId + '\n\nКлиент получит это фото с сообщением.',
        kk: '💐 <b>Шоқ фотосын жіберіңіз</b>\n\nТапсырыс #' + orderId + ' үшін дайын шоқтың фотосын жүктеңіз\n\nКлиент бұл фотоны хабарламамен алады.'
      },
      delivery: {
        ru: '📦 <b>Отправьте фото доставки</b>\n\nЗагрузите фото доставленного букета для заказа #' + orderId + '\n\nКлиент получит подтверждение доставки.',
        kk: '📦 <b>Жеткізу фотосын жіберіңіз</b>\n\nТапсырыс #' + orderId + ' үшін жеткізілген шоқтың фотосын жүктеңіз\n\nКлиент жеткізу растамасын алады.'
      }
    };

    const message = messages[photoType] || messages.bouquet;

    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: ADMIN_ID,
      text: message.ru + '\n\n' + message.kk,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '❌ Отменить', callback_data: `cancel_photo_${orderId}_${photoType}` }
        ]]
      }
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Ошибка отправки запроса на фото:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// API: Рассылка сообщений
app.post('/api/send-broadcast', async (req, res) => {
  try {
    const { messageRu, messageKk, customers } = req.body;

    if (!messageRu || !messageKk || !customers) {
      return res.status(400).json({ error: 'Неверные данные' });
    }

    console.log(`📢 Начинаем рассылку для ${customers.length} клиентов...`);

    let sentCount = 0;
    let errorCount = 0;

    // Отправляем каждому клиенту
    for (const customer of customers) {
      try {
        if (!customer.telegram_user_id) continue;

        // Определяем язык клиента
        const lang = customer.language_code || 'ru';
        const message = lang === 'kk' ? messageKk : messageRu;

        // Отправляем сообщение
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: customer.telegram_user_id,
          text: message,
          parse_mode: 'HTML'
        });

        sentCount++;
        console.log(`✅ Отправлено: ${customer.first_name} (${customer.telegram_user_id})`);

        // Небольшая задержка чтобы не превысить лимиты Telegram
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (error) {
        errorCount++;
        console.error(`❌ Ошибка отправки ${customer.telegram_user_id}:`, error.message);
      }
    }

    console.log(`📊 Рассылка завершена: ${sentCount} отправлено, ${errorCount} ошибок`);

    res.json({ 
      success: true, 
      sent: sentCount, 
      errors: errorCount 
    });

  } catch (error) {
    console.error('Ошибка рассылки:', error);
    res.status(500).json({ error: 'Ошибка' });
  }
});

// API: Настройка webhook
app.post('/api/setup-webhook', async (req, res) => {
  try {
    const webhookUrl = `${req.protocol}://${req.get('host')}/webhook`;
    
    const response = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      { url: webhookUrl }
    );

    res.json({ 
      success: true, 
      webhookUrl,
      telegram: response.data 
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Ошибка настройки webhook',
      details: error.message 
    });
  }
});

// API: Получить конфиг
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY
  });
});

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    project: PROJECT_TYPE,
    botConfigured: !!BOT_TOKEN,
    supabaseConfigured: !!(SUPABASE_URL && SUPABASE_KEY),
    adminConfigured: !!ADMIN_ID
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    project: 'flowers',
    botConfigured: !!BOT_TOKEN
  });
});

// Автоматическая установка webhook
async function setupWebhookOnStartup() {
  try {
    const webhookUrl = `https://flowershop-6jdk.onrender.com/webhook`;
    
    const checkResponse = await axios.get(
      `https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`
    );
    
    const currentWebhook = checkResponse.data.result.url;
    
    if (currentWebhook === webhookUrl) {
      console.log(`✅ Webhook уже установлен: ${webhookUrl}`);
      return;
    }
    
    console.log(`🔄 Установка webhook: ${webhookUrl}...`);
    const setResponse = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`,
      { url: webhookUrl }
    );
    
    if (setResponse.data.ok) {
      console.log(`✅ Webhook успешно установлен!`);
    } else {
      console.error(`❌ Ошибка установки webhook:`, setResponse.data);
    }
  } catch (error) {
    console.error(`❌ Ошибка при установке webhook:`, error.message);
  }
}

// Запуск сервера
app.listen(PORT, async () => {
  console.log(`🌸 Сервер цветочного магазина запущен на порту ${PORT}`);
  console.log(`📱 Telegram Bot: ${BOT_TOKEN ? '✅ Настроен' : '❌ Не настроен'}`);
  console.log(`🗄️  Supabase: ${SUPABASE_URL ? '✅ Настроен' : '❌ Не настроен'}`);
  console.log(`\n🔗 Webhook endpoint: /webhook`);
  
  if (BOT_TOKEN) {
    console.log('');
    await setupWebhookOnStartup();
  }
  
  console.log('');
});
