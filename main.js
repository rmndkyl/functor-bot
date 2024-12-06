(async () => {
    const fetch = (await import('node-fetch')).default;
    const chalk = (await import('chalk')).default;
    const ora = (await import('ora')).default;
    const fs = require('fs').promises;
    const readline = require('readline');

    // Configurable settings
    const config = {
        checkInInterval: 24 * 60 * 60 * 1000 // Default 24 hours
    };

    const headersTemplate = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
    };

    function getTimestamp() {
        return new Date().toLocaleString();
    }

    async function coday(url, method, payloadData = null, headers = headersTemplate) {
        try {
            const options = {
                method,
                headers,
                body: payloadData ? JSON.stringify(payloadData) : null
            };
            const response = await fetch(url, options);
            if (!response.ok) {
                console.error(chalk.red(`[${method}] Request to ${url} failed with status: ${response.status}`));
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error(chalk.red(`[${method}] Request to ${url} failed: ${error.message}`));
            return null;
        }
    }

    async function loadSessions() {
        try {
            const data = await fs.readFile('accounts.json', 'utf8');
            const accounts = JSON.parse(data);
            if (!Array.isArray(accounts)) throw new Error('Invalid accounts.json format');
            return accounts;
        } catch (error) {
            console.error(chalk.red("Error loading Accounts:"), error.message);
            return [];
        }
    }

    async function fetchUserDetails(headers) {
        return await coday("https://node.securitylabs.xyz/api/v1/users", 'GET', null, headers);
    }

    async function loginAndCheckIn(email, password) {
        console.log(chalk.blue(`[${getTimestamp()}] Attempting login for email: ${email}`));
        const spinner = ora(`Logging in with email: ${email}`).start();
        const signInPayload = { email, password };
        const signIn = await coday("https://node.securitylabs.xyz/api/v1/auth/signin-user", 'POST', signInPayload);

        if (signIn && signIn.accessToken) {
            spinner.succeed(`Login succeeded for ${email}`);
            const headers = { ...headersTemplate, 'Authorization': `Bearer ${signIn.accessToken}` };

            const user = await fetchUserDetails(headers);
            if (user) {
                const { id, dipTokenBalance } = user;
                console.log(chalk.cyan(`[${getTimestamp()}] User id: ${id} | Current points: ${dipTokenBalance}`));

                console.log(chalk.blue(`[${getTimestamp()}] Attempting daily check-in...`));
                const checkin = await coday(`https://node.securitylabs.xyz/api/v1/users/earn/${id}`, 'GET', null, headers);
                if (checkin && checkin.tokensToAward) {
                    console.log(chalk.green(`[${getTimestamp()}] Check-in successful! Awarded points: ${checkin.tokensToAward}`));
                } else {
                    console.log(chalk.yellow(`[${getTimestamp()}] Check-in not available yet.`));
                }
            } else {
                console.log(chalk.red(`[${getTimestamp()}] Failed to fetch user details.`));
            }
        } else {
            spinner.fail(`Login failed for ${email}`);
        }
    }

    async function promptForInterval() {
        return new Promise((resolve) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question(chalk.blue('Enter check-in interval in hours (default 24): '), (input) => {
                const hours = parseInt(input || '24', 10);
                rl.close();
                resolve(hours * 60 * 60 * 1000);
            });
        });
    }

    async function main() {
        console.log(chalk.green("Welcome to the Daily Check-in Script!\n"));
        config.checkInInterval = await promptForInterval();

        const sessions = await loadSessions();
        if (sessions.length === 0) {
            console.log(chalk.red("No Accounts found. Exiting..."));
            return;
        }

        console.log(chalk.green(`Loaded ${sessions.length} accounts. Starting check-in process...\n`));
        while (true) {
            console.log(chalk.magenta(`[${getTimestamp()}] Starting daily check-in process for all accounts...`));

            for (const session of sessions) {
                const { email, password } = session;
                if (email && password) {
                    await loginAndCheckIn(email, password);
                } else {
                    console.log(chalk.red(`[${getTimestamp()}] Missing email or password for an account.`));
                }
            }

            console.log(chalk.yellow(`[${getTimestamp()}] All accounts processed. Waiting for the next check-in...`));
            await new Promise(resolve => setTimeout(resolve, config.checkInInterval));
        }
    }

    process.on('SIGINT', () => {
        console.log(chalk.yellow('\nProcess interrupted. Exiting gracefully...'));
        process.exit();
    });

    main();
})();