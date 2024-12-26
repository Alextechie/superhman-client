import Account from "@/lib/account";
import { syncEmailsToDb } from "@/lib/sync-to-db";
import { db } from "@/server/db";
import { NextRequest, NextResponse } from "next/server";

export const POST = async (req: NextRequest) => {
    console.log("Request received at http://localhost:3000/api/initial-sync")
    const body = await req.json();
    const {accountId, userId} = body;

    // check if userId and accountId exists
    if(!accountId || !userId) {
            return NextResponse.json({
                message:'Missing the accountId or userId'
            }, {status: 404})
    }


    // query the db for the specif account with the accountId and the userId that matches
    // the account details
    const queryAccount = await db.account.findUnique({
        where: {
            id: accountId,
            userId
        }
    });

    if(!queryAccount) return NextResponse.json({
        message: 'Account not found'
    }, {status: 404})


    // perform initial sync
    const account = new Account(queryAccount.token);

    const response = await account.performInitialSync()
    if(!response) {
        return NextResponse.json({
            message: 'Failed to perform initial sync'
        }, {status: 500})
    };

    const {emails, deltaToken} = response

    // console.log('emails:', emails)


    await syncEmailsToDb(emails, accountId)

    console.log("sync completed", deltaToken)

    return  NextResponse.json({
        message: 'success'
    }, {status: 200})
}