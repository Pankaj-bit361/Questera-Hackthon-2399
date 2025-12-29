import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <FiArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
          <p className="text-zinc-500 mb-10">Last updated: December 13, 2024</p>

          <div className="space-y-8 text-zinc-300 leading-relaxed">
            {/* Introduction */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Introduction</h2>
              <p>
                Welcome to Velos AI ("we," "our," or "us"). We are committed to protecting your privacy and personal data.
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our
                AI-powered image generation platform at velosapps.com.
              </p>
            </section>

            {/* Information We Collect */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Information We Collect</h2>
              <p className="mb-3">We collect information you provide directly to us:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Account Information:</strong> Email address, name, and profile details when you create an account</li>
                <li><strong>User Content:</strong> Images you upload, prompts you create, and generated content</li>
                <li><strong>Payment Information:</strong> Billing details processed securely through our payment providers</li>
                <li><strong>Social Media Data:</strong> When you connect Instagram, we access your profile, pages, and posting permissions as authorized</li>
                <li><strong>Usage Data:</strong> How you interact with our platform, features used, and preferences</li>
              </ul>
            </section>

            {/* Instagram Integration */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. Instagram Integration</h2>
              <p className="mb-3">When you connect your Instagram account, we request the following permissions:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>public_profile:</strong> Read your basic public profile information</li>
                <li><strong>instagram_basic:</strong> Read your Instagram profile information</li>
                <li><strong>instagram_business_basic:</strong> Access your Instagram Business account information</li>
                <li><strong>instagram_business_content_publish:</strong> Publish photos, videos, stories and reels to your Instagram Business account</li>
                <li><strong>instagram_manage_comments:</strong> Read and respond to comments</li>
                <li><strong>instagram_manage_insights:</strong> Access analytics and performance metrics</li>
                <li><strong>pages_show_list:</strong> See your connected Facebook Pages</li>
                <li><strong>pages_read_engagement:</strong> Read engagement data from your Pages</li>
                <li><strong>business_management:</strong> Access Business Portfolio assets</li>
              </ul>
              <p className="mt-3">
                You can revoke these permissions at any time through your Instagram or Facebook settings.
              </p>
            </section>

            {/* How We Use Your Information */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. How We Use Your Information</h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Generate and edit AI images based on your prompts</li>
                <li>Schedule and publish content to your connected social accounts</li>
                <li>Provide analytics and insights on your content performance</li>
                <li>Process payments and manage your subscription</li>
                <li>Improve our AI models and platform features</li>
                <li>Send important updates about your account and our services</li>
              </ul>
            </section>

            {/* Data Storage & Security */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. Data Storage & Security</h2>
              <p>
                Your data is stored securely using industry-standard encryption. Images are stored on AWS S3 with
                appropriate access controls. We retain your data for as long as your account is active or as needed
                to provide services. You can request data deletion at any time.
              </p>
            </section>

            {/* Data Sharing */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Data Sharing</h2>
              <p className="mb-3">We do not sell your personal data. We may share information with:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Service Providers:</strong> Cloud hosting, payment processing, AI model providers</li>
                <li><strong>Social Platforms:</strong> When you authorize posting to Instagram/Facebook</li>
                <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
              </ul>
            </section>

            {/* Your Rights */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights</h2>
              <p className="mb-3">You have the right to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Access and download your personal data</li>
                <li>Correct inaccurate information</li>
                <li>Delete your account and associated data</li>
                <li>Disconnect social media integrations</li>
                <li>Opt out of marketing communications</li>
              </ul>
            </section>

            {/* Contact Us */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Contact Us</h2>
              <p>
                If you have questions about this Privacy Policy or our data practices, please contact us at:{' '}
                <a href="mailto:privacy@velosapps.com" className="text-white underline hover:text-zinc-300">
                  privacy@velosapps.com
                </a>
              </p>
            </section>

            {/* Changes */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. We will notify you of significant changes
                by posting the new policy on this page and updating the "Last updated" date.
              </p>
            </section>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default PrivacyPolicy;

