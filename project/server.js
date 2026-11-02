
const express = require("express");
const path = require("path");
const db = require("./db");
const bcrypt = require("bcrypt");
const session = require("express-session");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const app = express();
const PORT = 3000;

// Настройки EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Подключение CSS, изображений и других файлов
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Настройки сессии
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 2 * 60 * 60 * 1000
    }
}));

// Проверка авторизации для всех страниц
app.use((req, res, next) => {
    res.locals.isAdmin = Boolean(req.session.isAdmin);
    next();
});

// Защита страниц администратора
function requireAuth(req, res, next) {
    if (req.session.isAdmin) {
        return next();
    }

    res.redirect("/login");
}

// Главная страница
app.get("/", async (req, res) => {
    try {
        const places = await db.getCollection("places")
            .find({})
            .sort({ id: 1 })
            .toArray();

        res.render("index", {
            title: "Тур-гид по Астане",
            places: places
        });

    } catch (error) {
        console.error("Ошибка главной страницы:", error);
        res.status(500).render("error", {
            message: "Не удалось загрузить достопримечательности."
        });
    }
});

// Страница входа администратора
app.get("/login", (req, res) => {
    if (req.session.isAdmin) {
        return res.redirect("/add");
    }

    res.render("login", {
        title: "Вход администратора",
        error: null
    });
});

// Проверка логина и пароля
app.post("/login", async (req, res) => {
    try {
        const { login, password } = req.body;

        if (!login || !password) {
            return res.status(400).render("login", {
                title: "Вход администратора",
                error: "Введите логин и пароль."
            });
        }

        const correctLogin = login === process.env.ADMIN_LOGIN;
        const correctPassword = await bcrypt.compare(
            password,
            process.env.ADMIN_HASH
        );

        if (!correctLogin || !correctPassword) {
            return res.status(401).render("login", {
                title: "Вход администратора",
                error: "Неверный логин или пароль."
            });
        }

        // Создаём новую сессию после успешного входа
        req.session.regenerate((error) => {
            if (error) {
                console.error("Ошибка создания сессии:", error);

                return res.status(500).render("login", {
                    title: "Вход администратора",
                    error: "Не удалось выполнить вход."
                });
            }

            req.session.isAdmin = true;

            req.session.save((error) => {
                if (error) {
                    console.error("Ошибка сохранения сессии:", error);

                    return res.status(500).render("login", {
                        title: "Вход администратора",
                        error: "Не удалось сохранить авторизацию."
                    });
                }

                res.redirect("/add");
            });
        });

    } catch (error) {
        console.error("Ошибка авторизации:", error);

        res.status(500).render("login", {
            title: "Вход администратора",
            error: "Произошла ошибка при входе."
        });
    }
});

// Выход администратора
app.post("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error("Ошибка выхода:", error);
            return res.status(500).send("Не удалось выйти из аккаунта.");
        }

        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});

// Страница добавления достопримечательности
app.get("/add", requireAuth, (req, res) => {
    res.render("add", {
        title: "Добавить достопримечательность",
        errors: [],
        formData: {}
    });
});

// Добавление достопримечательности в MongoDB
app.post("/add", requireAuth, async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            time
        } = req.body;

        const errors = [];

        if (!title || title.trim().length < 8) {
            errors.push("Название должно содержать минимум 8 символов.");
        }

        if (!description || description.trim().length < 10) {
            errors.push("Описание должно содержать минимум 10 символов.");
        }

        if (!category) {
            errors.push("Выберите категорию.");
        }

        if (!time) {
            errors.push("Укажите время посещения.");
        }

        const formData = {
            title,
            description,
            category,
            time
        };

        if (errors.length > 0) {
            return res.status(400).render("add", {
                title: "Добавить достопримечательность",
                errors: errors,
                formData: formData
            });
        }

        const collection = db.getCollection("places");

        const lastPlace = await collection
            .find({})
            .sort({ id: -1 })
            .limit(1)
            .toArray();

        const newId = lastPlace.length > 0
            ? lastPlace[0].id + 1
            : 1;

        await collection.insertOne({
            id: newId,
            title: title.trim(),
            description: description.trim(),
            category,
            time,
            image: req.body.image || ""
        });

        res.redirect("/");

    } catch (error) {
        console.error("Ошибка добавления места:", error);

        res.status(500).render("error", {
            message: "Не удалось добавить достопримечательность."
        });
    }
});

// Страница отдельной достопримечательности
app.get("/place/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        const place = await db.getCollection("places").findOne({
            id: id
        });

        if (!place) {
            return res.status(404).render("404", {
                title: "Страница не найдена"
            });
        }

        res.render("place", {
            title: place.title,
            place: place,
            isAdmin: Boolean(req.session.isAdmin)
        });

    } catch (error) {
        console.error("Ошибка загрузки места:", error);

        res.status(500).render("error", {
            message: "Не удалось загрузить страницу.",
            isAdmin: Boolean(req.session.isAdmin)
        });
    }
});

// Страница о проекте
app.get("/about", (req, res) => {
    res.render("about", {
        title: "О проекте"
    });
});

// Страница 404
app.use((req, res) => {
    res.status(404).render("404", {
        title: "Страница не найдена"
    });
});

// Обработка серверных ошибок
app.use((error, req, res, next) => {
    console.error("Ошибка сервера:", error);

    res.status(500).render("error", {
        message: "Произошла внутренняя ошибка сервера."
    });
});

// Запуск сервера
async function startServer() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("Не найден MONGODB_URI в файле .env");
        }

        if (!process.env.ADMIN_LOGIN || !process.env.ADMIN_HASH) {
            throw new Error("Не настроены данные администратора в .env");
        }

        if (!process.env.SESSION_SECRET) {
            throw new Error("Не найден SESSION_SECRET в файле .env");
        }

        await db.connect();

        app.listen(PORT, () => {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("Ошибка запуска сервера:", error);
    }
}

startServer();
