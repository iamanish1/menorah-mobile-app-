export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Account Deletion</h1>
          <p className="text-gray-500">Menorah Health — User Data & Account Management</p>
        </div>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">How to Delete Your Account</h2>
          <p className="text-gray-600 mb-4">
            You can request account deletion at any time. To delete your account from the Menorah Health app:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-gray-600">
            <li>Open the Menorah Health app</li>
            <li>Go to <strong>Profile</strong> from the bottom navigation</li>
            <li>Tap <strong>Settings</strong></li>
            <li>Scroll down and tap <strong>Delete Account</strong></li>
            <li>Confirm your decision when prompted</li>
          </ol>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">What Gets Deleted</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-600">
            <li>Your personal profile information (name, email, phone number)</li>
            <li>Your booking and session history</li>
            <li>Your chat messages and conversations</li>
            <li>Your subscription and payment records</li>
            <li>All other data associated with your account</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Request via Email</h2>
          <p className="text-gray-600">
            If you are unable to delete your account from within the app, you can send a deletion request to:
          </p>
          <a
            href="mailto:support@menorah.me"
            className="inline-block mt-2 text-green-700 font-medium hover:underline"
          >
            support@menorah.me
          </a>
          <p className="text-gray-500 text-sm mt-2">
            Please include the email address associated with your account. We will process your request within 7 business days.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Data Retention</h2>
          <p className="text-gray-600">
            After deletion, your data will be permanently removed from our systems within 30 days.
            Some anonymized data may be retained for legal or compliance purposes as required by law.
          </p>
        </section>
      </div>
    </div>
  );
}
