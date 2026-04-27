const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Инициализируем права администратора для доступа к базе данных
admin.initializeApp();

// Защищенная серверная функция обработки подписки и начисления партнерских 20%
exports.processSubscription = functions.https.onCall(async (data, context) => {
    // 1. Жесткая проверка: пользователь обязан быть авторизован
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Отказ в доступе. Пользователь не авторизован.');
    }

    const uid = context.auth.uid;
    const { planId } = data;

    // 2. Цены хранятся строго на сервере, клиент не может их подделать
    const planPrices = { 'freelancer': 6, 'pro': 19 };
    const price = planPrices[planId] || 0;

    if (price === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Несуществующий тарифный план.');
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);

    // 3. АТОМАРНАЯ ТРАНЗАКЦИЯ (Защита от двойных списаний и гонок данных)
    return db.runTransaction(async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Профиль пользователя не найден.');
        }

        const userData = userDoc.data();
        const referredBy = userData.referredBy; // Узнаем, кто пригласил этого юзера

        // Обновляем тариф пользователя
        transaction.update(userRef, { plan: planId });

        // Если есть партнер — безопасно начисляем ему 20%
        if (referredBy) {
            const affiliateRef = db.collection('affiliates').doc(referredBy);
            const commission = Number((price * 0.20).toFixed(2)); // Строго 20% с округлением до центов
            
            transaction.set(affiliateRef, {
                earned: admin.firestore.FieldValue.increment(commission)
            }, { merge: true });
        }

        return { success: true, plan: planId, message: "Транзакция успешно проведена сервером." };
    });
});
