import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';

const TermsOfService = () => {
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
          <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
          <p className="text-zinc-500 mb-10">Last updated: December 13, 2024</p>

          <div className="space-y-8 text-zinc-300 leading-relaxed">
            {/* Agreement */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">1. Agreement to Terms</h2>
              <p>
                By accessing or using Velos AI ("the Service"), you agree to be bound by these Terms of Service. 
                If you disagree with any part of these terms, you may not access the Service.
              </p>
            </section>

            {/* Description of Service */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">2. Description of Service</h2>
              <p>
                Velos AI is an AI-powered image generation platform that allows users to create, edit, and 
                schedule visual content. The Service includes AI image generation, social media integration, 
                scheduling tools, and analytics features.
              </p>
            </section>

            {/* User Accounts */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">3. User Accounts</h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>You must provide accurate and complete information when creating an account</li>
                <li>You are responsible for maintaining the security of your account credentials</li>
                <li>You must be at least 18 years old to use this Service</li>
                <li>One person may not maintain more than one account</li>
                <li>You are responsible for all activities that occur under your account</li>
              </ul>
            </section>

            {/* Acceptable Use */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">4. Acceptable Use</h2>
              <p className="mb-3">You agree NOT to use the Service to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Generate illegal, harmful, or offensive content</li>
                <li>Create deepfakes or non-consensual imagery of real people</li>
                <li>Infringe on intellectual property rights of others</li>
                <li>Generate spam, malware, or deceptive content</li>
                <li>Attempt to bypass usage limits or security measures</li>
                <li>Resell or redistribute generated content as a competing service</li>
              </ul>
            </section>

            {/* Content Ownership */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">5. Content Ownership</h2>
              <p className="mb-3">
                <strong>Your Content:</strong> You retain ownership of content you upload (reference images, prompts).
              </p>
              <p className="mb-3">
                <strong>Generated Content:</strong> Subject to your subscription plan, you own the rights to images 
                generated through the Service for personal and commercial use.
              </p>
              <p>
                <strong>License to Us:</strong> You grant us a limited license to process, store, and display your 
                content as necessary to provide the Service.
              </p>
            </section>

            {/* Credits & Payments */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">6. Credits & Payments</h2>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Credits are consumed when generating or editing images</li>
                <li>Unused credits expire according to your plan terms</li>
                <li>Subscription fees are billed in advance on a recurring basis</li>
                <li>All payments are non-refundable except as required by law</li>
                <li>We reserve the right to modify pricing with 30 days notice</li>
              </ul>
            </section>

            {/* Third-Party Integrations */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">7. Third-Party Integrations</h2>
              <p>
                The Service integrates with third-party platforms (Instagram, Facebook). Your use of these 
                integrations is also subject to their respective terms of service. We are not responsible 
                for changes to third-party APIs or policies that may affect the Service.
              </p>
            </section>

            {/* Limitation of Liability */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">8. Limitation of Liability</h2>
              <p>
                THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE SHALL NOT BE LIABLE FOR 
                ANY INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
              </p>
            </section>

            {/* Termination */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">9. Termination</h2>
              <p>
                We may terminate or suspend your account immediately, without prior notice, for conduct that 
                we believe violates these Terms or is harmful to other users, us, or third parties.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-xl font-semibold text-white mb-3">10. Contact Us</h2>
              <p>
                For questions about these Terms, contact us at:{' '}
                <a href="mailto:legal@velosapps.com" className="text-white underline hover:text-zinc-300">
                  legal@velosapps.com
                </a>
              </p>
            </section>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default TermsOfService;

