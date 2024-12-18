import { db } from "@/server/db";

export const POST = async (req: Request) => {
    const { data } = await req.json();
    const { last_name: lastName, first_name: firstName, image_url: imageUrl, id } = data;
    const email = data.email_addresses[0].email_address;
    console.log(lastName);

    try {
        // check if user exists
        const checkIfExists = await db.user.findUnique({
            where: {
                id
            }
        })
        if (checkIfExists) {
            return Response.json({
                message: "User already exists",
                status: 400
            })
        }

        // store the data onto the db
        const user = await db.user.create({
            data: {
                id,
                email,
                lastName,
                firstName,
                imageUrl
            }
        })
        console.log("user created:", user)
    } catch (err) {
        console.log("Error adding user to the database");
        return Response.json({
            message: "Error adding user to the database"
        })
    }

    return new Response("Webhook received", { status: 200 });
}