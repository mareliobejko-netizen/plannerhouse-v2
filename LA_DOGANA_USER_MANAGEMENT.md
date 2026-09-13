# La Dogana Guest Portal — User Management update

This update adds:

- **Guest Portal Feedback** wording instead of PlannerHouse experience.
- Admin **User management** page (`/admin/users`).
- Edit guest account name and login email.
- Generate and set temporary passwords.
- Delete users after their owned events have been removed.
- Delete events from the admin dashboard or the linked-events section.
- Password generator in **Create user + event**.
- Automatically generated English invitation text after account creation.
- The invitation is **not sent automatically**. It is only displayed for the admin to copy.
- First-login password choice for newly created guests.
- Guest **Account** page so a password can be changed later.

## Required Neon migration

Before deploying this version, run the SQL in:

`public/add_user_management_fields.sql`

It adds:

`public.profiles.password_prompt_pending`

Existing accounts default to `false`. New accounts created from the admin dashboard are set to `true`.

## First-login flow

1. Admin creates the account with a temporary password.
2. The admin copies the generated invitation text into their own email client.
3. No email is sent by PlannerHouse / the Guest Portal.
4. The guest signs in.
5. The guest can choose **Create my password** or **Keep current password**.
6. The guest can later change the password from **Account**.

## Admin delete behavior

Deleting an event permanently removes its guest list, event memberships and event notifications.

A user account cannot be deleted while it still owns an event. Delete the owned event(s) first, then delete the user. This is intentional to reduce accidental data loss.
