-- readAt bereits in früherer Migration vorhanden; sicherstellen, dass der Typ passt
ALTER TABLE `CustomerMessage`
MODIFY `readAt` DATETIME NULL;
