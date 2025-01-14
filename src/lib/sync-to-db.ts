import { db } from "@/server/db";
import { EmailAddress, emailAddressSchema, EmailAttachment, EmailMessage } from "./types";
import pLimit from "p-limit"

async function syncEmailsToDb(emails: EmailMessage[], accountId: string){
    console.log("Attempting to sync ", emails.length);
    const limit = pLimit(2)

    try{
    //    await Promise.all(emails.map((email, index) => upsertEmails(email, accountId, index)))
        let count = 0;
    
       for(const email of emails){
        await upsertEmails(email, accountId, count++)
       }
    } catch(err){
        console.error("Opps error syncing emails to Db")
    }
}


export async function upsertEmails(email: EmailMessage, accountId: string, index: number){
    console.log("Upserting email", index)

    try{
        let emailLabelType: 'inbox' | 'draft' |  'sent' = 'inbox'

        if(email.sysLabels.includes('inbox') || email.sysLabels.includes('important')){
            emailLabelType = 'inbox'
        } else if(email.sysLabels.includes('sent')){
            emailLabelType = 'sent'
        } else if(email.sysLabels.includes('draft')){
            emailLabelType = 'draft'
        }

        const addressToUpsert = new Map();
        for(const address of [email.from, ...email.to, ...email.cc, ...email.bcc, ...email.replyTo]) {
            addressToUpsert.set(address.address, address)
        }

        const upsertedAddresses: (Awaited<ReturnType<typeof upsertEmailAddress>>)[] = [];


        for(const address of addressToUpsert.values()) {
            const upsertedAddress = await upsertEmailAddress(address, accountId)
            upsertedAddresses.push(upsertedAddress)
        }


        const addressMap = new Map(
            upsertedAddresses.filter(Boolean).map(address => [address?.address, address])
        )

        const fromAddress = addressMap.get(email.from.address);

        if(!fromAddress) {
            console.log("Failed to upsert from address from email " + email.bodySnippet + ".");
        }

        const toAddresses = email.to.map(addr => addressMap.get(addr.address)).filter(Boolean);
        const ccAddresses = email.cc.map(addr => addressMap.get(addr.address)).filter(Boolean);
        const bccAddresses = email.bcc.map(addr => addressMap.get(addr.address)).filter(Boolean);
        const replyToAddresses = email.replyTo.map(addr => addressMap.get(addr.address)).filter(Boolean)


        // insert and update the threads table
        const thread = await db.thread.upsert({
            where: { id: email.threadId },
            update: {
                subject: email.subject,
                accountId,
                lastMessageDate: new Date(email.sentAt),
                done: false,
                participantIds: [...new Set([
                    fromAddress!.id,
                    ...toAddresses.map(a => a!.id),
                    ...ccAddresses.map(a => a!.id),
                    ...bccAddresses.map(a => a!.id)
                ])]
            },
            create: {
                id: email.threadId,
                accountId,
                subject: email.subject,
                done: false,
                draftStatus: emailLabelType === 'draft',
                inboxStatus: emailLabelType === 'inbox',
                sentStatus: emailLabelType === 'sent',
                lastMessageDate: new Date(email.sentAt),
                participantIds: [...new Set([
                    fromAddress!.id,
                    ...toAddresses.map(a => a!.id),
                    ...ccAddresses.map(a => a!.id),
                    ...bccAddresses.map(a => a!.id)
                ])]
            }
        })


        // upsert email
        await db.email.upsert({
            where: { id: email.id },
            update: {
                threadId: thread.id,
                createdTime: new Date(email.createdTime),
                lastModifiedTime: new Date(),
                sentAt: new Date(email.sentAt),
                receivedAt: new Date(email.receivedAt),
                internetMessageId: email.internetMessageId,
                subject: email.subject,
                sysLabels: email.sysLabels,
                keywords: email.keywords,
                sysClassifications: email.sysClassifications,
                sensitivity: email.sensitivity,
                meetingMessageMethod: email.meetingMessageMethod,
                fromId: fromAddress!.id,
                to: { set: toAddresses.map(a => ({ id: a!.id })) },
                cc: { set: ccAddresses.map(a => ({ id: a!.id })) },
                bcc: { set: bccAddresses.map(a => ({ id: a!.id })) },
                replyTo: { set: replyToAddresses.map(a => ({ id: a!.id })) },
                hasAttachments: email.hasAttachments,
                internetHeaders: email.internetHeaders as any,
                body: email.body,
                bodySnippet: email.bodySnippet,
                inReplyTo: email.inReplyTo,
                references: email.references,
                threadIndex: email.threadIndex,
                nativeProperties: email.nativeProperties as any,
                folderId: email.folderId,
                omitted: email.omitted,
                emailLabel: emailLabelType,
            },
            create: {
                id: email.id,
                emailLabel: emailLabelType,
                threadId: thread.id,
                createdTime: new Date(email.createdTime),
                lastModifiedTime: new Date(),
                sentAt: new Date(email.sentAt),
                receivedAt: new Date(email.receivedAt),
                internetMessageId: email.internetMessageId,
                subject: email.subject,
                sysLabels: email.sysLabels,
                internetHeaders: email.internetHeaders as any,
                keywords: email.keywords,
                sysClassifications: email.sysClassifications,
                sensitivity: email.sensitivity,
                meetingMessageMethod: email.meetingMessageMethod,
                fromId: fromAddress!.id,
                to: { connect: toAddresses.map(a => ({ id: a!.id })) },
                cc: { connect: ccAddresses.map(a => ({ id: a!.id })) },
                bcc: { connect: bccAddresses.map(a => ({ id: a!.id })) },
                replyTo: { connect: replyToAddresses.map(a => ({ id: a!.id })) },
                hasAttachments: email.hasAttachments,
                body: email.body,
                bodySnippet: email.bodySnippet,
                inReplyTo: email.inReplyTo,
                references: email.references,
                threadIndex: email.threadIndex,
                nativeProperties: email.nativeProperties as any,
                folderId: email.folderId,
                omitted: email.omitted,
            }
        });


        const threadEmails = await db.email.findMany({
            where: { threadId: thread.id },
            orderBy: { receivedAt: 'asc' }
        });

        let threadFolderType = 'sent';
        for (const threadEmail of threadEmails) {
            if (threadEmail.emailLabel === 'inbox') {
                threadFolderType = 'inbox';
                break; // If any email is in inbox, the whole thread is in inbox
            } else if (threadEmail.emailLabel === 'draft') {
                threadFolderType = 'draft'; // Set to draft, but continue checking for inbox
            }
        }
        await db.thread.update({
            where: { id: thread.id },
            data: {
                draftStatus: threadFolderType === 'draft',
                inboxStatus: threadFolderType === 'inbox',
                sentStatus: threadFolderType === 'sent',
            }
        });

        // 4. Upsert Attachments
        for (const attachment of email.attachments) {
            await upsertAttachment(email.id, attachment);
        }
    } catch(err){

    }
}   


export async function upsertEmailAddress(address: EmailAddress, accountId: string){
    try{
        const existingAddress = await db.emailAddress.findUnique({
            where: {
                accountId_address: {  accountId: accountId, address: address.address ?? "" }
            }
        })

        if(existingAddress){
            return await db.emailAddress.findUnique({
                where: {id: existingAddress.id}
            })
        } else {
            return await db.emailAddress.create({
                data: {
                    address: address.address ?? "", name: address.name, raw: address.raw, accountId
                }
            });
        }
    } catch(err){
        console.error('Error upserting email address:', err)
        return null
    }
}


async function upsertAttachment(emailId: string, attachment: EmailAttachment) {
    try {
        await db.emailAttachment.upsert({
            where: { id: attachment.id ?? "" },
            update: {
                name: attachment.name,
                mimeType: attachment.mimeType,
                size: attachment.size,
                inline: attachment.inline,
                contentId: attachment.contentId,
                content: attachment.content,
                contentLocation: attachment.contentLocation,
            },
            create: {
                id: attachment.id,
                emailId,
                name: attachment.name,
                mimeType: attachment.mimeType,
                size: attachment.size,
                inline: attachment.inline,
                contentId: attachment.contentId,
                content: attachment.content,
                contentLocation: attachment.contentLocation,
            },
        });
    } catch (error) {
        console.log(`Failed to upsert attachment for email ${emailId}: ${error}`);
    }
}

export { syncEmailsToDb };