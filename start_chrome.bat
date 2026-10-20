@echo off
echo ====================================================
echo Iniciando Google Chrome con depuracion remota (CDP)
echo Puerto: 9222
echo ====================================================
echo.
echo Asegurate de que TODAS las ventanas de Chrome esten cerradas antes de hacer esto.
echo Si ya hay un Chrome abierto normal, el puerto de depuracion no funcionara.
echo.
pause

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
exit
