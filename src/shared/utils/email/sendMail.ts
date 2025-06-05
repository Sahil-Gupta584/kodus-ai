import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';

const sendInvite = async (user, adminUserEmail, invite) => {
    try {
        const mailersend = new MailerSend({
            apiKey: process.env.API_MAILSEND_API_TOKEN,
        });

        const recipients = [new Recipient(user.email, user.teamMember.name)];
        const sentFrom = new Sender(
            'kody@notifications.kodus.io',
            'Kody from Kodus',
        );

        const personalization = [
            {
                email: user.email,
                data: {
                    organizationName: user.organization.name,
                    invitingUser: {
                        email: adminUserEmail,
                    },
                    teamName: user.teamMember[0].team.name,
                    invitedUser: {
                        name: user.teamMember[0].name,
                        invite,
                    },
                },
            },
        ];

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setSubject(
                `You've been invited to join ${user.teamMember[0].team.name}`,
            )
            .setTemplateId('351ndgwnvy5gzqx8')
            .setPersonalization(personalization);

        return await mailersend.email.send(emailParams);
    } catch (error) {
        console.log(error);
    }
};

const sendForgotPasswordEmail = async (
    email: string,
    name: string,
    token: string,
) => {
    try {
        const webUrl = process.env.API_USER_INVITE_BASE_URL;

        const mailersend = new MailerSend({
            apiKey: process.env.API_MAILSEND_API_TOKEN,
        });

        const recipients = [new Recipient(email, name)];
        const sentFrom = new Sender(
            'kody@notifications.kodus.io',
            'Kody from Kodus',
        );

        const personalization = [
            {
                email: email,
                data: {
                    account: {
                        name: email,
                    },
                    resetLink: `${webUrl}/forgot-password/reset?token=${token}`,
                },
            },
        ];

        const emailParams = new EmailParams()
            .setFrom(sentFrom)
            .setTo(recipients)
            .setSubject('Reset your Kodus password')
            .setTemplateId('z3m5jgrmxpm4dpyo')
            .setPersonalization(personalization);

        return await mailersend.email.send(emailParams);
    } catch (error) {
        console.error('sendForgotPasswordEmail error:', error);
    }
};

const sendKodyRulesNotification = async (
    users: Array<{ email: string; name: string }>,
    rules: Array<{ title: string; rule: string; severity: string }>,
    organizationName: string,
) => {
    try {
        const mailersend = new MailerSend({
            apiKey: process.env.API_MAILSEND_API_TOKEN,
        });

        const sentFrom = new Sender(
            'kody@notifications.kodus.io',
            'Kody from Kodus',
        );

        // Limitar regras para máximo 3 itens
        const limitedRules = rules.slice(0, 3);

        // Enviar email para cada usuário individualmente para personalização
        const emailPromises = users.map(async (user) => {
            const recipients = [new Recipient(user.email, user.name)];
            
            const personalization = [
                {
                    email: user.email,
                    data: {
                        user: {
                            name: user.name,
                        },
                        organization: {
                            name: organizationName,
                        },
                        rules: limitedRules,
                        rulesCount: rules.length,
                    },
                },
            ];

            const emailParams = new EmailParams()
                .setFrom(sentFrom)
                .setTo(recipients)
                .setSubject(`New Kody Rules Generated for ${organizationName}`)
                .setTemplateId('yzkq340nv50gd796')
                .setPersonalization(personalization);

            return await mailersend.email.send(emailParams);
        });

        return await Promise.allSettled(emailPromises);
    } catch (error) {
        console.error('sendKodyRulesNotification error:', error);
        throw error;
    }
};

export { sendInvite, sendForgotPasswordEmail, sendKodyRulesNotification };
