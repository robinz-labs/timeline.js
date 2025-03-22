#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QtWebEngine>
#include <QLoggingCategory>

int main(int argc, char *argv[])
{
    QCoreApplication::setAttribute(Qt::AA_EnableHighDpiScaling);
    
    // Enable WebEngine logging
    QLoggingCategory::setFilterRules("qt.webengine*=true");
    
    QGuiApplication app(argc, argv);
    QtWebEngine::initialize();

    QQmlApplicationEngine engine;
    engine.load(QUrl(QStringLiteral("qrc:/main.qml")));
    
    if (engine.rootObjects().isEmpty())
        return -1;

    return app.exec();
}