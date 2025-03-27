![FishCracker](https://github.com/user-attachments/assets/4bafd85a-0469-4a50-87d1-597ea20b7994)

[Getting Fish-Shaped Crackers Back into Vending Machines (or Fishcracker)](https://marketplace.visualstudio.com/items?itemName=wh0.fishcracker) is a Visual Studio extention to connect [Glitch](https://glitch.com) to Visual Studio.

----
Commands:
1. `auth.persistent_token`: Authenticate the extention with your Glitch persistent token. 
2. `term_command`: Open the Glitch Terminal
3. `logs`: Open the Glitch Logs
4. `logout`: Unauthenticate the extention and remove your persistent token.
5. `open_project`: Open a project via name. Must be authenticated to open any project.

----
**Getting your Glitch Persistent Token**
1. Open [Glitch](https://glitch.com/) and log in to your account
2. Open Devtools by pressing `F12` or `Ctrl`+`Shift`+`I`
3. In the console, run this command:
   ```js
   console.log(JSON.parse(localStorage.cachedUser)?.persistentToken);
   ```
4. Copy the output and use that to authenticate your account.

**WARNING: This persistent token is like a password. *Don't share it with anyone.***
