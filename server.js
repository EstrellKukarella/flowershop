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
      deliveryType,
      deliveryAddress,
      deliveryDate,
      deliveryTime,
      telegramUserId, 
      telegramUsername, 
      items, 
      subtotal,
      cashbackUsed,
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
    message += `📋 Заказ #${orderId}\n`;
    message += `📅 ${formatDateTimeAstana(date)}\n\n`;
    
    message += "<b>👤 Клиент:</b>\n";
    message += `Имя: ${customerName}\n`;
    message += `Телефон: +7${customerPhone}\n`;
    if (telegramUsername) message += `Telegram: @${telegramUsername}\n`;
    if (telegramUserId) message += `ID: ${telegramUserId}\n`;
    
    // Информация о доставке
    if (deliveryType === 'delivery') {
      message += `\n<b>🚚 Доставка:</b>\n`;
      message += `📍 Адрес: ${deliveryAddress}\n`;
      message += `📅 Дата: ${deliveryDate}\n`;
      message += `⏰ Время: ${deliveryTime}\n`;
    } else {
      message += `\n<b>🏪 Самовывоз</b>\n`;
    }
    
    if (customerComment) message += `\n💬 Комментарий: ${customerComment}\n`;
    
    message += "\n<b>💐 Товары:</b>\n";
    items.forEach(item => {
      message += `• ${item.name} x${item.quantity} = ${item.price * item.quantity} ₸\n`;
    });
    
    // Детальная информация об оплате
    message += "\n━━━━━━━━━━━━━━━━━━━━";
    message += "\n<b>💳 ОПЛАТА:</b>\n";
    
    if (cashbackUsed && cashbackUsed > 0) {
      message += `\n<b>Сумма товаров:</b> ${subtotal} ₸`;
      message += `\n<b>💰 Оплачено кэшбеком:</b> <code>-${cashbackUsed} ₸</code>`;
      message += `\n<b>💵 К оплате деньгами:</b> <code>${total} ₸</code>`;
      message += `\n\n✅ Клиент использовал кэшбек`;
    } else {
      message += `\n<b>💵 К оплате:</b> <code>${total} ₸</code>`;
      message += `\n\n💰 Кэшбек не использован`;
    }
    message += "\n━━━━━━━━━━━━━━━━━━━━";

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
      paymentMessage += `📋 Заказ / Тапсырыс #${orderId}\n`;
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
        orderNumber: orderId, // Полный номер
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
    const { userId, status, orderNumber, shopPhone, orderId } = req.body;

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

    // Если заказ доставлен - начисляем кэшбек 5%
    if (status === 'delivered' && orderId) {
      try {
        // Получаем заказ
        const { data: order } = await supabase
          .from(getTableName('orders'))
          .select('*')
          .eq('id', orderId)
          .single();

        if (order && order.total) {
          const cashbackAmount = Math.floor(order.total * 0.05); // 5% кэшбека
          
          // Получаем текущий баланс клиента
          let { data: customer } = await supabase
            .from(getTableName('customers'))
            .select('cashback_balance, total_orders')
            .eq('telegram_user_id', userId)
            .single();

          // Если клиента нет - создаём
          if (!customer) {
            await supabase
              .from(getTableName('customers'))
              .insert({
                telegram_user_id: userId,
                cashback_balance: 0,
                total_orders: 0
              });
            
            customer = { cashback_balance: 0, total_orders: 0 };
          }

          const currentBalance = customer?.cashback_balance || 0;
          const currentTotalOrders = customer?.total_orders || 0;
          const newBalance = currentBalance + cashbackAmount;

          // Обновляем баланс и счётчик заказов
          await supabase
            .from(getTableName('customers'))
            .update({ 
              cashback_balance: newBalance,
              total_orders: currentTotalOrders + 1
            })
            .eq('telegram_user_id', userId);

          // Создаём транзакцию
          await supabase
            .from(getTableName('cashback_transactions'))
            .insert({
              telegram_user_id: userId,
              order_id: orderId,
              type: 'earned',
              amount: cashbackAmount,
              balance_after: newBalance
            });

          // Добавляем инфо о кэшбеке в сообщение
          const cashbackMessage = `\n\n💰 <b>Вам начислен кэшбек: ${cashbackAmount} ₸</b>\nИспользуйте при следующем заказе!\n\n🇰🇿 <b>Сізге кэшбек жинақталды: ${cashbackAmount} ₸</b>\nКелесі тапсырыста пайдаланыңыз!`;
          
          const fullMessage = messages.ru + '\n\n' + messages.kk + cashbackMessage;
          
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: userId,
            text: fullMessage,
            parse_mode: 'HTML'
          });
          
          return res.json({ success: true });
        }
      } catch (error) {
        console.error('Ошибка начисления кэшбека:', error);
      }
    }

    // Отправляем обычное уведомление для других статусов
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

      // Inline кнопки (в сообщении)
      const inlineKeyboard = {
        inline_keyboard: [[
          { 
            text: languageCode === 'kk' ? '🌸 Гүл таңдау' : '🌸 Выбрать букет',
            web_app: { url: CLIENT_APP_URL }
          }
        ]]
      };

      // Если админ - добавляем кнопку админки в inline
      if (chatId === ADMIN_ID) {
        inlineKeyboard.inline_keyboard.push([
          { 
            text: '⚙️ Админ-панель',
            web_app: { url: ADMIN_APP_URL }
          }
        ]);
      }

      // Постоянная клавиатура снизу (reply keyboard)
      const replyKeyboard = {
        keyboard: [[
          { text: languageCode === 'kk' ? '🌸 Гүл каталогы' : '🌸 Цветочная', web_app: { url: CLIENT_APP_URL } }
        ]],
        resize_keyboard: true,
        persistent: true
      };

      // Если админ - добавляем админские кнопки снизу
      if (chatId === ADMIN_ID) {
        replyKeyboard.keyboard.push([
          { text: '⚙️ Админ-панель', web_app: { url: ADMIN_APP_URL } }
        ]);
        replyKeyboard.keyboard.push([
          { text: '📊 Статистика' },
          { text: '📢 Рассылка' }
        ]);
      }

      // Отправляем сообщение с inline кнопками
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: welcomeText,
        parse_mode: 'HTML',
        reply_markup: inlineKeyboard
      });

      // Отправляем постоянную клавиатуру снизу
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: languageCode === 'kk' ? '✨ Төмендегі батырмаларды пайдаланыңыз:' : '✨ Используйте кнопки ниже:',
        reply_markup: replyKeyboard
      });
    }

    // Обработка кнопки "Статистика" (только для админа)
    if (update.message && update.message.text === '📊 Статистика') {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;

      if (userId === ADMIN_ID) {
        try {
          // Получаем статистику из БД
          const { data: allOrders } = await supabase
            .from(getTableName('orders'))
            .select('*');

          const { data: customers } = await supabase
            .from(getTableName('customers'))
            .select('*');

          const { data: products } = await supabase
            .from(getTableName('products'))
            .select('*');

          // Подсчёты
          const totalOrders = allOrders?.length || 0;
          const totalRevenue = allOrders?.reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0) || 0;
          
          const pendingOrders = allOrders?.filter(o => o.status === 'pending').length || 0;
          const processingOrders = allOrders?.filter(o => o.status === 'processing').length || 0;
          const readyOrders = allOrders?.filter(o => o.status === 'ready').length || 0;
          const deliveredOrders = allOrders?.filter(o => o.status === 'delivered').length || 0;
          const cancelledOrders = allOrders?.filter(o => o.status === 'cancelled').length || 0;

          const totalCustomers = customers?.length || 0;
          const totalProducts = products?.length || 0;
          const availableProducts = products?.filter(p => p.available).length || 0;

          // Статистика за сегодня
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayOrders = allOrders?.filter(o => new Date(o.created_at) >= today).length || 0;
          const todayRevenue = allOrders?.filter(o => new Date(o.created_at) >= today)
            .reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0) || 0;

          // Статистика за неделю
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          const weekOrders = allOrders?.filter(o => new Date(o.created_at) >= weekAgo).length || 0;
          const weekRevenue = allOrders?.filter(o => new Date(o.created_at) >= weekAgo)
            .reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0) || 0;

          // Статистика за месяц
          const monthAgo = new Date();
          monthAgo.setDate(monthAgo.getDate() - 30);
          const monthOrders = allOrders?.filter(o => new Date(o.created_at) >= monthAgo).length || 0;
          const monthRevenue = allOrders?.filter(o => new Date(o.created_at) >= monthAgo)
            .reduce((sum, order) => sum + (parseFloat(order.total) || 0), 0) || 0;

          // Средний чек
          const avgOrderValue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

          // Топ-3 популярных товаров
          const productSales = {};
          allOrders?.forEach(order => {
            order.items?.forEach(item => {
              if (!productSales[item.name]) {
                productSales[item.name] = { count: 0, revenue: 0 };
              }
              productSales[item.name].count += item.quantity;
              productSales[item.name].revenue += item.price * item.quantity;
            });
          });
          
          const topProducts = Object.entries(productSales)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 3);

          const statsMessage = `📊 <b>СТАТИСТИКА ЦВЕТОЧНОЙ ЛАВКИ</b>

━━━━━━━━━━━━━━━━━━━━
📈 <b>ОБЩАЯ СТАТИСТИКА</b>

💰 Общий доход: <b>${totalRevenue.toFixed(0)} ₸</b>
📦 Всего заказов: <b>${totalOrders}</b>
💵 Средний чек: <b>${avgOrderValue} ₸</b>
👥 Клиентов: <b>${totalCustomers}</b>
🌸 Товаров: <b>${totalProducts}</b> (в наличии: ${availableProducts})

━━━━━━━━━━━━━━━━━━━━
📅 <b>ЗА СЕГОДНЯ</b>

📦 Заказов: <b>${todayOrders}</b>
💰 Доход: <b>${todayRevenue.toFixed(0)} ₸</b>

━━━━━━━━━━━━━━━━━━━━
📅 <b>ЗА НЕДЕЛЮ</b>

📦 Заказов: <b>${weekOrders}</b>
💰 Доход: <b>${weekRevenue.toFixed(0)} ₸</b>

━━━━━━━━━━━━━━━━━━━━
📅 <b>ЗА МЕСЯЦ</b>

📦 Заказов: <b>${monthOrders}</b>
💰 Доход: <b>${monthRevenue.toFixed(0)} ₸</b>

━━━━━━━━━━━━━━━━━━━━
📋 <b>СТАТУСЫ ЗАКАЗОВ</b>

⏰ Ожидают: <b>${pendingOrders}</b>
👨‍🍳 В работе: <b>${processingOrders}</b>
✅ Готовы: <b>${readyOrders}</b>
🎉 Доставлено: <b>${deliveredOrders}</b>
❌ Отменено: <b>${cancelledOrders}</b>

${topProducts.length > 0 ? `━━━━━━━━━━━━━━━━━━━━
🏆 <b>ТОП-3 ТОВАРОВ</b>

${topProducts.map((p, i) => `${i + 1}. ${p[0]}: ${p[1].count} шт (${p[1].revenue} ₸)`).join('\n')}
` : ''}
━━━━━━━━━━━━━━━━━━━━
🕐 Обновлено: ${new Date().toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}`;

          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: statsMessage,
            parse_mode: 'HTML'
          });
        } catch (error) {
          console.error('Ошибка получения статистики:', error);
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: chatId,
            text: '❌ Ошибка получения статистики'
          });
        }
      } else {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '❌ Эта функция доступна только администраторам'
        });
      }
    }

    // Обработка кнопки "Рассылка" (только для админа)
    if (update.message && update.message.text === '📢 Рассылка') {
      const chatId = update.message.chat.id;
      const userId = update.message.from.id;

      if (userId === ADMIN_ID) {
        pendingReceipts.set(`broadcast_${userId}`, 'waiting');
        
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: `📢 <b>Рассылка сообщений</b>

Отправьте сообщение, которое хотите разослать всем клиентам.

Поддерживаются:
• Текст
• Фото с подписью
• Видео с подписью

Сообщение будет отправлено всем клиентам из базы данных.

Нажмите /cancel чтобы отменить.`,
          parse_mode: 'HTML'
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '❌ Эта функция доступна только администраторам'
        });
      }
    }

    // Обработка сообщений для рассылки
    if (update.message && pendingReceipts.has(`broadcast_${update.message.from.id}`)) {
      const userId = update.message.from.id;
      
      if (userId !== ADMIN_ID) return res.json({ ok: true });
      
      // Отмена
      if (update.message.text === '/cancel') {
        pendingReceipts.delete(`broadcast_${userId}`);
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: userId,
          text: '❌ Рассылка отменена'
        });
        return res.json({ ok: true });
      }
      
      // Получаем всех клиентов
      const { data: customers } = await supabase
        .from(getTableName('customers'))
        .select('telegram_user_id');
      
      if (!customers || customers.length === 0) {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: userId,
          text: '❌ Нет клиентов в базе данных'
        });
        pendingReceipts.delete(`broadcast_${userId}`);
        return res.json({ ok: true });
      }
      
      let successCount = 0;
      let failCount = 0;
      
      // Отправляем сообщение
      for (const customer of customers) {
        try {
          if (update.message.photo) {
            // Отправляем фото
            const photo = update.message.photo[update.message.photo.length - 1];
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
              chat_id: customer.telegram_user_id,
              photo: photo.file_id,
              caption: update.message.caption || ''
            });
          } else if (update.message.video) {
            // Отправляем видео
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
              chat_id: customer.telegram_user_id,
              video: update.message.video.file_id,
              caption: update.message.caption || ''
            });
          } else if (update.message.text) {
            // Отправляем текст
            await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
              chat_id: customer.telegram_user_id,
              text: update.message.text,
              parse_mode: 'HTML'
            });
          }
          successCount++;
        } catch (error) {
          console.error(`Ошибка отправки клиенту ${customer.telegram_user_id}:`, error.message);
          failCount++;
        }
        
        // Небольшая задержка между сообщениями
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Отчёт админу
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: userId,
        text: `✅ <b>Рассылка завершена!</b>

📊 Статистика:
✅ Отправлено: ${successCount}
❌ Ошибок: ${failCount}
📧 Всего клиентов: ${customers.length}`,
        parse_mode: 'HTML'
      });
      
      pendingReceipts.delete(`broadcast_${userId}`);
      return res.json({ ok: true });
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

        if (order && order.telegram_user_id) {
          await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            chat_id: order.telegram_user_id,
            text: `✅ <b>Оплата подтверждена!</b>\n\n📋 Заказ #${orderId}\n\nМы приняли ваш заказ в работу! 🌸`,
            parse_mode: 'HTML'
          });
        }

        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
          callback_query_id: callbackQuery.id,
          text: '✅ Оплата подтверждена!'
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
            text: `❌ <b>Чек не принят</b>\n\n📋 Заказ #${orderId}\n\nПожалуйста, отправьте корректный чек.\n\n🇰🇿 <b>Чек қабылданбады</b>\n\nДұрыс чекті жіберіңіз.`,
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

    // Обработка фото (чека)
    if (update.message && update.message.photo) {
      const chatId = update.message.chat.id;
      const photo = update.message.photo[update.message.photo.length - 1];
      
      const orderId = pendingReceipts.get(`waiting_${chatId}`);
      
      if (orderId) {
        const orderInfo = pendingReceipts.get(orderId);
        
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
                { text: "✅ Подтвердить", callback_data: `confirm_payment_${orderId}` },
                { text: "❌ Отклонить", callback_data: `reject_payment_${orderId}` }
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
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Ошибка обработки webhook:', error);
    res.json({ ok: true });
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

// API: Настройка Menu Button вручную
app.get('/api/setup-menu-button', async (req, res) => {
  try {
    // Настройка кнопки для ВСЕХ пользователей (включая админа)
    console.log(`🔄 Настройка Menu Button для всех пользователей...`);
    
    const defaultMenuResponse = await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/setChatMenuButton`,
      {
        menu_button: {
          type: 'web_app',
          text: '🌸 Выбрать букет',
          web_app: { url: CLIENT_APP_URL }
        }
      }
    );

    if (defaultMenuResponse.data.ok) {
      console.log(`✅ Menu Button настроена для всех: ${CLIENT_APP_URL}`);
      res.json({
        success: true,
        message: 'Menu Button настроена! У всех (включая админа) слева будет "🌸 Выбрать букет"',
        url: CLIENT_APP_URL,
        note: 'Админ дополнительно имеет кнопки снизу: Админ-панель, Статистика, Рассылка'
      });
    } else {
      res.status(500).json({
        error: 'Telegram вернул ошибку',
        details: defaultMenuResponse.data
      });
    }

  } catch (error) {
    console.error(`❌ Ошибка настройки Menu Button:`, error.message);
    res.status(500).json({ 
      error: 'Ошибка настройки Menu Button',
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
    } else {
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
    }
    
    // Menu Button настраивается вручную через BotFather
    console.log(`ℹ️  Menu Button настраивается через BotFather или /api/setup-menu-button`);
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
