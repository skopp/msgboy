# This is a rake file that packs and upload a new version
require 'json'
require 'rexml/document'

def version
  doc = REXML::Document.new File.read( "updates.xml" )
  version = REXML::XPath.each(doc, "/gupdate/app/updatecheck") { |element| element.to_s }.first.attributes['version']
end

def ignorefile
  /\.(?:pem|gitignore|DS_Store)|README.md/
end

def ignoredir
  /\.(?:git)|test/
end

def manifest(destination = "chrome")
  manifest_file =  'manifest.json'
  manifest_path = './build/'
  manifest = {
    :name => "msgboy",
    :manifest_version => 2,
    :minimum_chrome_version => "19.0.1084.56",
    :description => "Msgboy is a smart reader that pushes your web. You can train it so that eventually it will show only the most relevant content.",
    :homepage_url => "http://msgboy.com/",
    :options_page => "/data/html/options.html",
    :app => {
      :launch => {
        :local_path => "/data/html/dashboard.html"
      }
    },
    :permissions => [
      "notifications",
      "tabs",
      "background",
      "management",
      "unlimitedStorage",
      "history",
      "bookmarks",
      "http://*/",
      "https://*/"
    ],
    :content_scripts => [
      {
        :js => [
          "/lib/run_plugins.js"
        ],
        :css => [
        ],
        :matches => [
          "*://*/*",
        ],
        :all_frames => true,
      }
    ],
    :background =>  {
      :page => "/data/html/background.html"
    },
    :content_security_policy => "script-src 'self' https://ssl.google-analytics.com; object-src 'self'",
    :icons => {
      16 => "data/img/icon16.png",
      48 => "data/img/icon48.png",
      128 => "data/img/icon128.png"
    },
    :update_url => "http://sup.ee/update-msgboy",
    :intents => {
     "http://webintents.org/subscribe" => [{
       :title => "Subscribe with Msgboy",
       :type => ["application/atom+xml", "application/rss+xml"],
       :href => "/data/html/subscribe.html",
       :disposition => "window"
     }],
     "http://webintents.org/view" => [{
       :title => "View in Msgboy",
       :type => ["application/atom+xml", "application/rss+xml"],
       :href => "/data/html/subscribe.html",
       :disposition => "window"
     }]
    },
    :web_accessible_resources => [
      "/data/html/signup.html",
    ]
  }

  case destination
  when "chromestore"
    manifest.delete(:update_url)
  when "firefox"
    manifest[:icon] = manifest[:icons][48]
    manifest[:homepage] = manifest[:homepage_url]
    manifest[:id] = "msgboy"
    manifest.delete(:minimum_chrome_version)
    manifest.delete(:homepage_url)
    manifest.delete(:options_page)
    manifest.delete(:app)
    manifest.delete(:permissions)
    manifest.delete(:content_scripts)
    manifest.delete(:background)
    manifest.delete(:icons)
    manifest.delete(:update_url)
    manifest.delete(:intents)
    manifest.delete(:background_page)
    manifest.delete(:background_page)
    manifest[:main] = 'lib/main.js'
    manifest_file =  'package.json'
  when 'chromedev'
    # No
  end
  manifest[:version] = version # Adds the version
  # Now, write the manifest.json
  FileUtils.remove(manifest_path + manifest_file, :force => true)
  File.open(manifest_path + manifest_file,"w") do |f|
    f.write(JSON.pretty_generate(manifest))
  end
end


build_tasks = [:frontend, :background, :tests]

task :build => [:'build:assets'] + build_tasks.map() { |t| :"build:#{t}"  } + [:'build:run_plugins'] + [:'build:clicked'] + [:'build:sass']
namespace :build do
  build_tasks.each do |k|
    desc "Building #{k}.js"
    task k do
      puts "Building #{k}.js"
      `browserify --require 'http-browserify' --require 'br-jquery' --require 'backbone-browserify' --alias 'http:http-browserify' --alias 'jquery:br-jquery' --alias 'backbone:backbone-browserify' ./src/#{k}.js -o ./build/lib/#{k}.js`
    end
  end
  desc "Building run_plugins.js"
  task :run_plugins do
    puts "Building run_plugins.js"
    `browserify ./src/run_plugins.js -o ./build/lib/run_plugins.js`
  end
  desc "Building clicked.js"
  task :clicked do
    puts "Building clicked.js"
    `browserify ./src/clicked.js -o ./build/lib/clicked.js`
  end
  desc "Compile SASS files into CSS"
  task :sass do
    puts "Compiling SASS"
    `compass compile`
  end

  desc "Creates the manifest file for the platform (chromedev, chromestore, firefox)."
  task :manifest, :platform do |task, args|
    args.with_defaults :platform => "chromedev"
    manifest(args[:platform])
  end


  desc "Scaffolding Msgboy for the right platform (chromedev, chromestore, firefox)."
  task :init, :platform do |task, args|
    args.with_defaults :platform => "chromedev"
    puts "Building scaffold for #{args[:platform]}"
    if args[:platform] == "firefox"
      `rm -rf build/* && cd build && cfx init`
      # And write the manifest.
    elsif args[:platform] == "chromedev"
      `rm -rf build/* && cd build && cfx init`
      `rm ./build/package.json`
      `rm ./build/lib/main.js`
    elsif args[:platform] == "chromestore"
      `rm -rf build/* && cd build && cfx init`
      `rm ./build/package.json`
      `rm ./build/lib/main.js`
    end
    manifest( args[:platform])
  end

  desc "Copies over the assets"
  task :assets do
    puts "Copying assets"
    `cp -R ./views/html ./build/data/.`
    `cp -R ./views/img ./build/data/.`
    `cp src/socket.io.js ./build/lib/.`
    `mkdir ./build/data/css/`
  end
end

task :version => [:'version:current']

namespace :version do
  begin
    require 'git'

    desc "Bumps version for the extension, both in the updates.xml and the manifest file."
    task :bump, :version do |task, args|
      # Rake::Task["lint:validate"].invoke # Let's lint before
      # Makes sure we have no pending commits, and that we're on master
      g = Git.open (".")
      if (g.status.added.empty? and g.status.changed.empty? and g.status.deleted.empty?)
        if (g.branch.name == "master")
          # First, update the updates.xml
          doc = REXML::Document.new File.read( "updates.xml" )
          REXML::XPath.each(doc, "/gupdate/app/updatecheck") { |element| element.to_s }.first.attributes['version'] = args[:version]
          # puts doc.to_s
          File.open('updates.xml','w') { |f|
            f.write doc.to_s
          }
          manifest() # Rewrite the manifest
          # # Finally, let's tag the repo
          g.commit("Version bump #{version}", { :add_all => true,  :allow_empty => true})
          g.add_tag(version)
        else
          puts "Please make sure you use the master branch to package new versions"
        end
      else
        puts "You have pending changed. Please commit them first."
      end
    end

  rescue LoadError
    puts "Please install the git gem if you want to bump the version of the msgboy."
  end

  desc "Prints the version for the extension"
  task :current do
    puts "Current version #{version}"
  end

end


##
begin
  require 'crxmake'
  desc "Packs msgboy, for chrome"
  task :pack, [:platform] => [:'build:init', :'build:manifest', :'build'] do |tasks, args|
    args.with_defaults :platform => "chromedev"

    `mkdir ./pkg/`

    if args[:platform] == "chromedev"
      FileUtils.remove("./pkg/msgboy.crx", :force => true)
      CrxMake.make(
      :ex_dir       => "./build",
      :pkey         => "key.pem",
      :crx_output   => "./pkg/msgboy.crx",
      :verbose      => true,
      :ignorefile   => ignorefile,
      :ignoredir    => ignoredir
      )
    elsif args[:platform] == "chromestore"
      FileUtils.remove("./pkg/msgboy.zip", :force => true)
      CrxMake.zip(
      :ex_dir       => "./build",
      :pkey         => "key.pem",
      :zip_output   => "./pkg/msgboy.zip",
      :verbose      => true,
      :ignorefile   => ignorefile,
      :ignoredir    => ignoredir
      )
    end
    puts "Extension #{version} packed for #{args[:platform]}"
  end
rescue LoadError
  puts "Please install the crxmake gem if you want to package the msgboy gem"
  # not installed
end



namespace :upload do

  desc "Uploads a crx to S3"
  task :s3 do |tasks, args|
  end

end


namespace :publish do

  task :upload => [:'upload:crx', :'upload:updates_xml', :'upload:push_git']

  namespace :upload do
    begin
      require 'aws/s3'
      s3 = {} # S3 params.
      if FileTest.exist?("s3.json")
        s3 = JSON.load(File.read("s3.json"))
      end
      desc "Uploads the extension"
      task :crx do
        AWS::S3::Base.establish_connection!(:access_key_id     => s3['access_key_id'], :secret_access_key => s3['secret_access_key'])
        AWS::S3::S3Object.store('msgboy.crx',  open('./build/msgboy.crx'), s3['bucket'], { :content_type => 'application/x-chrome-extension', :access => :public_read })
        puts "Extension #{version} uploaded"
      end

      desc "Uploads the updates.xml file"
      task :updates_xml do
        AWS::S3::Base.establish_connection!(
        :access_key_id     => s3['access_key_id'],
        :secret_access_key => s3['secret_access_key']
        )
        AWS::S3::S3Object.store(
        'updates.xml',
        open('./updates.xml'),
        s3['bucket'],
        {
          :access => :public_read
        }
        )
        puts "Updates.xml #{version} uploaded"
      end

      desc "Pushes to the git remotes"
      task :push_git do
        g = Git.open (".")
        res = g.push("origin", "master", true)
        puts res
      end

      desc "Deploys the splash page"
      task :splash do
        AWS::S3::Base.establish_connection!(:access_key_id     => s3['access_key_id'], :secret_access_key => s3['secret_access_key'])
        AWS::S3::S3Object.store('index.html', open('./splash.html'), s3['splash-bucket'], {:access => :public_read})
        FileList['views/css/*.css'].each do |f|
          AWS::S3::S3Object.store(f, open(f), s3['splash-bucket'], {:access => :public_read})
        end
        FileList['views/images/*.png'].each do |f|
          AWS::S3::S3Object.store(f, open(f), s3['splash-bucket'], {:access => :public_read})
        end
        FileList['views/images/*.jpg'].each do |f|
          AWS::S3::S3Object.store(f, open(f), s3['splash-bucket'], {:access => :public_read})
        end
        FileList['views/images/*.gif'].each do |f|
          AWS::S3::S3Object.store(f, open(f), s3['splash-bucket'], {:access => :public_read})
        end
        FileList['views/images/splash/*'].each do |f|
          AWS::S3::S3Object.store(f, open(f), s3['splash-bucket'], {:access => :public_read})
        end
        AWS::S3::S3Object.store('src/bootstrap-modal.js', open('src/bootstrap-modal.js'), s3['splash-bucket'], {:access => :public_read})
      end

    rescue LoadError
      puts "Please install the s3 gem if you want to upload the msgboy to s3."
    end
  end

end


